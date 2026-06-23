import axios from "axios";
import { env } from "../config/env";
import {
  TMDBMovie,
  TMDBTVShow,
  TMDBWatchProvidersResponse,
  OTTProviderInfo,
} from "../types";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// 한국 주요 OTT 플랫폼 식별자 정의
export const TARGET_PROVIDERS: Record<number, string> = {
  8: "Netflix",
  337: "Disney+",
  1883: "티빙 (TVING)",
  356: "웨이브 (Wavve)",
  350: "Apple TV+",
  97: "왓챠 (Watcha)",
  119: "Prime Video",
};

export class TMDBService {
  private apiKey: string;

  constructor() {
    this.apiKey = env.TMDB_API_KEY;
  }

  /**
   * TMDB API 키 유효성 확인
   */
  public hasValidApiKey(): boolean {
    return this.apiKey.length > 0 && this.apiKey !== "YOUR_TMDB_API_KEY_HERE";
  }

  /**
   * 한국 지역의 공개 예정 영화 목록 조회
   */
  public async getUpcomingMovies(page = 1): Promise<TMDBMovie[]> {
    if (!this.hasValidApiKey()) {
      return [];
    }

    try {
      const response = await axios.get(
        `${TMDB_BASE_URL}/movie/upcoming`,
        {
          params: {
            api_key: this.apiKey,
            language: "ko-KR",
            region: "KR",
            page,
          },
        },
      );
      return response.data.results || [];
    } catch (error: any) {
      console.error("[ERROR] TMDb 영화 목록 조회 실패:", error.message);
      return [];
    }
  }

  /**
   * 한국 지역의 현재 상영 중인 영화 목록 조회
   */
  public async getNowPlayingMovies(page = 1): Promise<TMDBMovie[]> {
    if (!this.hasValidApiKey()) {
      return [];
    }

    try {
      const response = await axios.get(
        `${TMDB_BASE_URL}/movie/now_playing`,
        {
          params: {
            api_key: this.apiKey,
            language: "ko-KR",
            region: "KR",
            page,
          },
        },
      );
      return response.data.results || [];
    } catch (error: any) {
      console.error(
        "[ERROR] TMDb 상영 중인 영화 목록 조회 실패:",
        error.message,
      );
      return [];
    }
  }

  /**
   * 방송 예정인 TV 프로그램 목록 조회
   */
  public async getUpcomingTVShows(page = 1): Promise<TMDBTVShow[]> {
    if (!this.hasValidApiKey()) {
      return [];
    }

    try {
      const response = await axios.get(
        `${TMDB_BASE_URL}/tv/on_the_air`,
        {
          params: {
            api_key: this.apiKey,
            language: "ko-KR",
            timezone: "Asia/Seoul",
            page,
          },
        },
      );
      return response.data.results || [];
    } catch (error: any) {
      console.error("[ERROR] TMDb TV 목록 조회 실패:", error.message);
      return [];
    }
  }

  /**
   * 특정 네트워크(Netflix 등)의 방송 예정/중인 TV 프로그램 목록 조회 (Discover)
   */
  public async getNetworkTVShows(networkId: number, page = 1): Promise<TMDBTVShow[]> {
    if (!this.hasValidApiKey()) {
      return [];
    }

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const response = await axios.get(`${TMDB_BASE_URL}/discover/tv`, {
        params: {
          api_key: this.apiKey,
          language: 'ko-KR',
          timezone: 'Asia/Seoul',
          watch_region: 'KR',
          with_networks: networkId,
          'first_air_date.gte': todayStr,
          sort_by: 'first_air_date.asc',
          page
        }
      });
      return response.data.results || [];
    } catch (error: any) {
      console.error(`[ERROR] TMDb 네트워크 ${networkId} TV 목록 조회 실패:`, error.message);
      return [];
    }
  }

  /**
   * 영화/TV 쇼의 한국(KR) 지역 OTT 제공업체 정보 조회
   */
  public async getOTTProviders(
    mediaType: "movie" | "tv",
    id: number,
  ): Promise<OTTProviderInfo[]> {
    if (!this.hasValidApiKey()) {
      return [];
    }

    try {
      const response = await axios.get<TMDBWatchProvidersResponse>(
        `${TMDB_BASE_URL}/${mediaType}/${id}/watch/providers`,
        {
          params: { api_key: this.apiKey },
        },
      );

      const krProviders = response.data.results?.KR;
      if (!krProviders) return [];

      // Flatrate(구독형) 제공업체 중 우리가 타겟팅하는 OTT 플랫폼 추출
      const providersList = krProviders.flatrate || [];
      return providersList
        .filter((p) => TARGET_PROVIDERS[p.provider_id])
        .map((p) => ({
          provider_id: p.provider_id,
          provider_name: TARGET_PROVIDERS[p.provider_id],
          logo_path: p.logo_path,
        }));
    } catch (error: any) {
      console.error(
        `[ERROR] ID ${id} (${mediaType}) OTT 정보 조회 실패:`,
        error.message,
      );
      return [];
    }
  }
}
export const tmdbService = new TMDBService();
