import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { tmdbService } from './tmdb.service';
import { CleanedUpcomingWork, OTTProviderInfo } from '../types';

const prisma = new PrismaClient();

export class SchedulerService {
  /**
   * 플랫폼별 표준 공개 시간 규칙 반환
   */
  private getStandardReleaseTime(providers: OTTProviderInfo[]): string {
    const providerIds = providers.map(p => p.provider_id);
    
    // 넷플릭스(8) 또는 디즈니+(337)가 포함된 경우 일반적으로 17시 공개
    if (providerIds.includes(8) || providerIds.includes(337)) {
      return '17:00:00';
    }
    // 티빙(1883) 또는 웨이브(356)가 포함된 경우 12시 공개
    if (providerIds.includes(1883) || providerIds.includes(356)) {
      return '12:00:00';
    }
    // 기본값은 자정
    return '00:00:00';
  }

  /**
   * TMDb에서 데이터를 수집하여 DB에 Upsert 수행
   */
  public async syncUpcomingData(): Promise<{ success: boolean; count: number }> {
    console.log('[BATCH] OTT 공개 예정 및 현재 방영작 동기화 배치를 시작합니다 (Discover API 기반)...');
    let syncCount = 0;
    const syncedIds: number[] = [];

    // 네트워크 ID와 OTT 제공업체 매핑 정보 (공식 Watch Provider 로고 이미지 경로와 일치하도록 정렬)
    const NETWORK_TO_PROVIDER: Record<number, { provider_id: number; provider_name: string; logo_path: string }> = {
      213: { provider_id: 8, provider_name: 'Netflix', logo_path: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg' },
      2739: { provider_id: 337, provider_name: 'Disney+', logo_path: '/97yvRBw1GzX7fXprcF80er19ot.jpg' },
      2552: { provider_id: 350, provider_name: 'Apple TV+', logo_path: '/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg' }
    };

    try {
      // 1. TMDB에서 영화(공개예정 + 현재상영) 목록 조회
      const upcomingMovies = await tmdbService.getUpcomingMovies(1);
      const nowPlayingMovies = await tmdbService.getNowPlayingMovies(1);

      // 영화 중복 제거
      const movieMap = new Map<number, typeof upcomingMovies[0]>();
      upcomingMovies.forEach(m => movieMap.set(m.id, m));
      nowPlayingMovies.forEach(m => movieMap.set(m.id, m));
      const movies = Array.from(movieMap.values());

      // 2. TV 쇼 조회 (기본 방영예정/중 목록 + 오리지널 네트워크별 예정작 목록)
      const baseTvShows = await tmdbService.getUpcomingTVShows(1);
      const tvShowToNetworkMap = new Map<number, number>();

      const tvShowsList = [...baseTvShows];

      // 주요 스트리밍 네트워크별 공개 예정작 Discover 조회
      for (const networkId of [213, 2739, 2552]) {
        const networkShows = await tmdbService.getNetworkTVShows(networkId, 1);
        console.log(`[BATCH] Network ID ${networkId}에서 예정작 ${networkShows.length}개 조회됨.`);
        for (const s of networkShows) {
          tvShowToNetworkMap.set(s.id, networkId);
          if (!tvShowsList.some(ts => ts.id === s.id)) {
            tvShowsList.push(s);
          }
        }
      }

      console.log(`[BATCH] 영화 ${movies.length}개, TV 쇼 ${tvShowsList.length}개 획득. OTT 공급자 확인 중...`);

      // 3. 영화 데이터 처리
      for (const movie of movies) {
        if (!movie.release_date) continue;

        const providers = await tmdbService.getOTTProviders('movie', movie.id);
        
        // 상세 로그 출력
        console.log(`[LOG] 영화: "${movie.title}" (${movie.original_title}) | 개봉일: ${movie.release_date} | TMDB ID: ${movie.id}`);
        if (providers.length > 0) {
          console.log(`  └─ 매칭된 OTT: ${providers.map(p => p.provider_name).join(', ')}`);
        } else {
          console.log(`  └─ 매칭된 OTT 없음 (TMDb에 국내 OTT 정보가 등록되지 않음)`);
        }

        // 타겟 OTT 플랫폼에 제공되지 않는 신작은 제외
        if (providers.length === 0) continue;

        const releaseTime = this.getStandardReleaseTime(providers);
        const releaseDate = new Date(`${movie.release_date}T${releaseTime}`);

        const cleaned: CleanedUpcomingWork = {
          id: movie.id,
          title: movie.title,
          originalTitle: movie.original_title,
          mediaType: 'movie',
          overview: movie.overview,
          posterPath: movie.poster_path,
          backdropPath: movie.backdrop_path,
          releaseDate,
          releaseTime,
          popularity: movie.popularity,
          voteAverage: movie.vote_average,
          providers
        };

        await this.upsertUpcomingWork(cleaned);
        syncedIds.push(movie.id);
        syncCount++;
      }

      // 4. TV 쇼 데이터 처리
      for (const tv of tvShowsList) {
        if (!tv.first_air_date) continue;

        const providers = await tmdbService.getOTTProviders('tv', tv.id);
        
        // 상세 로그 출력
        console.log(`[LOG] TV 쇼: "${tv.name}" (${tv.original_name}) | 방영일: ${tv.first_air_date} | TMDB ID: ${tv.id}`);

        // Discover 네트워크 정보에 기인한 강제 주입 로직
        const associatedNetworkId = tvShowToNetworkMap.get(tv.id);
        if (associatedNetworkId && NETWORK_TO_PROVIDER[associatedNetworkId]) {
          const targetProvider = NETWORK_TO_PROVIDER[associatedNetworkId];
          if (!providers.some(p => p.provider_id === targetProvider.provider_id)) {
            providers.push(targetProvider);
            console.log(`  └─ [INJECT] 네트워크(${associatedNetworkId}) 매칭을 통한 OTT(${targetProvider.provider_name}) 강제 주입 완료`);
          }
        }

        if (providers.length > 0) {
          console.log(`  └─ 매칭된 OTT: ${providers.map(p => p.provider_name).join(', ')}`);
        } else {
          console.log(`  └─ 매칭된 OTT 없음 (TMDb에 국내 OTT 정보가 등록되지 않음)`);
        }

        // 타겟 OTT 플랫폼에 제공되지 않는 신작은 제외
        if (providers.length === 0) continue;

        const releaseTime = this.getStandardReleaseTime(providers);
        const releaseDate = new Date(`${tv.first_air_date}T${releaseTime}`);

        const cleaned: CleanedUpcomingWork = {
          id: tv.id,
          title: tv.name,
          originalTitle: tv.original_name,
          mediaType: 'tv',
          overview: tv.overview,
          posterPath: tv.poster_path,
          backdropPath: tv.backdrop_path,
          releaseDate,
          releaseTime,
          popularity: tv.popularity,
          voteAverage: tv.vote_average,
          providers
        };

        await this.upsertUpcomingWork(cleaned);
        syncedIds.push(tv.id);
        syncCount++;
      }

      // 5. 방영이 끝나거나 동기화 목록에서 제외된 오래된 데이터 삭제 (용량 확보)
      if (syncedIds.length > 0) {
        const deleteResult = await prisma.upcomingWork.deleteMany({
          where: {
            id: {
              notIn: syncedIds
            }
          }
        });
        console.log(`[BATCH] 동기화 리스트 외 오래된 데이터 ${deleteResult.count}개 삭제 완료.`);
      }

      console.log(`[BATCH] 동기화 완료! 총 ${syncCount}개의 작품 정보가 최신화되었습니다.`);
      return { success: true, count: syncCount };
    } catch (error: any) {
      console.error('[BATCH] [ERROR] 동기화 배치 진행 중 오류 발생:', error.message);
      return { success: false, count: syncCount };
    }
  }

  /**
   * DB 레벨의 Upsert 연산 수행 (중복 데이터 처리)
   */
  private async upsertUpcomingWork(work: CleanedUpcomingWork): Promise<void> {
    await prisma.upcomingWork.upsert({
      where: { id: work.id },
      update: {
        title: work.title,
        originalTitle: work.originalTitle,
        overview: work.overview,
        posterPath: work.posterPath,
        backdropPath: work.backdropPath,
        releaseDate: work.releaseDate,
        releaseTime: work.releaseTime,
        popularity: work.popularity,
        voteAverage: work.voteAverage,
        providers: work.providers as any // MongoDB Prisma Json 타입 대입
      },
      create: {
        id: work.id,
        title: work.title,
        originalTitle: work.originalTitle,
        mediaType: work.mediaType,
        overview: work.overview,
        posterPath: work.posterPath,
        backdropPath: work.backdropPath,
        releaseDate: work.releaseDate,
        releaseTime: work.releaseTime,
        popularity: work.popularity,
        voteAverage: work.voteAverage,
        providers: work.providers as any // MongoDB Prisma Json 타입 대입
      }
    });
  }

  /**
   * 매 정시마다 실행되도록 크론 작업 스케줄링 (0 * * * *)
   */
  public startScheduler(): void {
    console.log('[SCHEDULER] 1시간 주기 데이터 동기화 스케줄러가 활성화되었습니다.');
    cron.schedule('0 * * * *', async () => {
      console.log('[SCHEDULER] 크론 스케줄링 작동 정시 배치 실행...');
      await this.syncUpcomingData();
    });
  }
}

export const schedulerService = new SchedulerService();
