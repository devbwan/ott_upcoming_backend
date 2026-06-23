import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import timelineRouter from './routes/timeline.route';
import { schedulerService } from './services/scheduler.service';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// API 라우터 매핑
app.use('/api/upcoming', timelineRouter);

// 헬스 체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 서버 실행 및 스케줄러 기동
const server = app.listen(env.PORT, async () => {
  console.log(`==================================================`);
  console.log(`[SERVER] OTT Upcoming Scheduler가 시작되었습니다.`);
  console.log(`[SERVER] 포트 번호: http://localhost:${env.PORT}`);
  console.log(`==================================================`);

  // 스케줄러 등록
  schedulerService.startScheduler();

  // 최초 기동 시 데이터 유무 체크 후 없으면 즉시 동기화 실행
  try {
    const count = await prisma.upcomingWork.count();
    if (count === 0) {
      console.log('[SERVER] DB 내 데이터가 없습니다. 최초 1회 즉시 동기화를 실행합니다...');
      await schedulerService.syncUpcomingData();
    } else {
      console.log(`[SERVER] DB 내에 이미 ${count}개의 공개 예정작 정보가 보관되어 있습니다.`);
    }
  } catch (error: any) {
    console.error('[SERVER] [ERROR] 초기 기동 DB 확인/동기화 실패:', error.message);
  }
});

// 프로세스 종료 시 자원 해제
process.on('SIGTERM', async () => {
  console.log('[SERVER] SIGTERM 수신, 서버 종료 처리...');
  await prisma.$disconnect();
  server.close();
});
