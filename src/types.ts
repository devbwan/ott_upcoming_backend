// TMDB API 및 DB 내부 연동을 위한 공통 타입 정의

export interface TMDBProvider {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

export interface TMDBWatchProvidersResult {
  link?: string;
  flatrate?: TMDBProvider[];
  rent?: TMDBProvider[];
  buy?: TMDBProvider[];
}

export interface TMDBWatchProvidersResponse {
  id: number;
  results: {
    KR?: TMDBWatchProvidersResult;
    [country: string]: any;
  };
}

export interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  popularity: number;
  vote_average: number;
}

export interface TMDBTVShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  popularity: number;
  vote_average: number;
}

export interface OTTProviderInfo {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface CleanedUpcomingWork {
  id: number;
  title: string;
  originalTitle: string;
  mediaType: 'movie' | 'tv';
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: Date;
  releaseTime: string;
  popularity: number;
  voteAverage: number;
  providers: OTTProviderInfo[];
}
