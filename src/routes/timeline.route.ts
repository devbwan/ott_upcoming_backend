import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { schedulerService } from '../services/scheduler.service';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/upcoming/providers
 * 데이터베이스에 등록된 유효 OTT 플랫폼 목록 반환 (Deduplicated & Normalized)
 */
router.get('/providers', async (req: Request, res: Response) => {
  try {
    const works = await prisma.upcomingWork.findMany({
      select: { providers: true }
    });

    const providerMap = new Map<number, any>();
    works.forEach(w => {
      const list = JSON.parse(JSON.stringify(w.providers));
      if (Array.isArray(list)) {
        list.forEach((p: any) => {
          let id = p.provider_id;
          let name = p.provider_name;
          let logo = p.logo_path;

          // 영화(1883, 356)와 TV(531, 442) 식별자 및 이름 정규화
          if (id === 531 || id === 1883) {
            id = 1883;
            name = '티빙 (TVING)';
          } else if (id === 442 || id === 356) {
            id = 356;
            name = '웨이브 (Wavve)';
          } else if (id === 337) {
            name = 'Disney+';
          } else if (id === 350) {
            name = 'Apple TV+';
          }

          providerMap.set(id, {
            provider_id: id,
            provider_name: name,
            logo_path: logo
          });
        });
      }
    });

    const uniqueProviders = Array.from(providerMap.values());
    return res.json({ success: true, data: uniqueProviders });
  } catch (error: any) {
    console.error('[API] OTT 공급자 조회 중 에러 발생:', error);
    return res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
});

/**
   * GET /api/upcoming/timeline
   * 타임라인 조회 API (날짜순 정렬 및 OTT 필터링 지원)
   */
router.get('/timeline', async (req: Request, res: Response) => {
  try {
    const providerIdsQuery = req.query.providers as string; // 예: "8,337"
    
    // DB에서 보관 중인 모든 활성 작품 조회 (날짜 오름차순 정렬)
    const works = await prisma.upcomingWork.findMany({
      orderBy: {
        releaseDate: 'asc'
      }
    });

    // DB에 보관된 providers가 Json 객체 형식이므로 캐스팅만 수행
    const formattedWorks = works.map(work => ({
      ...work,
      providers: work.providers as any
    }));

    // 특정 OTT 필터링이 요청된 경우 필터 적용
    if (providerIdsQuery) {
      const filterIds = providerIdsQuery.split(',').map(id => parseInt(id.trim(), 10));
      
      // TVING(1883, 531) 및 웨이브(356, 442) 영화/TV ID 상호 매핑 확장
      const expandedFilterIds = [...filterIds];
      if (filterIds.includes(1883) || filterIds.includes(531)) {
        if (!expandedFilterIds.includes(1883)) expandedFilterIds.push(1883);
        if (!expandedFilterIds.includes(531)) expandedFilterIds.push(531);
      }
      if (filterIds.includes(356) || filterIds.includes(442)) {
        if (!expandedFilterIds.includes(356)) expandedFilterIds.push(356);
        if (!expandedFilterIds.includes(442)) expandedFilterIds.push(442);
      }

      const filtered = formattedWorks.filter(work => 
        work.providers.some((p: any) => expandedFilterIds.includes(p.provider_id))
      );
      return res.json({ success: true, data: filtered });
    }

    return res.json({ success: true, data: formattedWorks });
  } catch (error: any) {
    console.error('[API] 타임라인 조회 중 에러 발생:', error);
    return res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
});

/**
 * POST /api/upcoming/sync
 * 수동 동기화 작동 트리거 API
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const result = await schedulerService.syncUpcomingData();
    if (result.success) {
      return res.json({
        success: true,
        message: '동기화 배치가 성공적으로 완료되었습니다.',
        count: result.count
      });
    } else {
      return res.status(500).json({
        success: false,
        message: '동기화 배치 실행 도중 에러가 발생했습니다.'
      });
    }
  } catch (error: any) {
    console.error('[API] 수동 동기화 중 에러 발생:', error);
    return res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
});

export default router;
