import dotenv from 'dotenv';
import path from 'path';

// .env 파일 로드
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  TMDB_API_KEY: process.env.TMDB_API_KEY || '',
};

// 필수 환경 변수 검증
if (!env.TMDB_API_KEY) {
  console.warn('[WARNING] TMDB_API_KEY가 설정되지 않았습니다. .env 파일을 확인해 주세요.');
}
