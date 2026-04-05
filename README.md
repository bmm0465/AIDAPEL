# AIEEBSS

초등 영어 기초 학력 진단을 위한 웹 플랫폼입니다. 로그인 후 로비에서 **6교시 평가**를 순서대로 진행하고, 결과는 세션 단위로 조회할 수 있습니다. 교사 계정은 담당 학생의 결과 분석·내보내기·문항·교육과정 도구를 사용할 수 있습니다.

## 평가 구성 (6교시)

| 교시 | 경로 | 설명(로비 기준) |
|------|------|------------------|
| 1교시 | `/test/p1_alphabet` | 알파벳 대소문자를 소리 내어 읽기 |
| 2교시 | `/test/p2_segmental_phoneme` | 단어를 듣고 올바른 단어 또는 알파벳 고르기 |
| 3교시 | `/test/p3_suprasegmental_phoneme` | 단어를 듣고 올바른 강세 고르기 |
| 4교시 | `/test/p4_phonics` | 무의미 단어·단어·문장을 소리 내어 읽기 |
| 5교시 | `/test/p5_vocabulary` | 단어·어구·문장을 듣거나 읽고 올바른 그림 고르기 |
| 6교시 | `/test/p6_comprehension` | 대화를 듣거나 읽고 질문에 맞는 그림 고르기 |

일부 서버 코드의 전사·분석 유틸리티 이름에 DIBELS 계열 관례가 남아 있을 수 있습니다. 현재 사용자-facing 평가 흐름은 위 6교시 기준입니다.

## 주요 기능

- **학생**: 로비(`/lobby`)에서 교시별 평가 시작, 이전 결과(`/results`, 세션별 `/results/sessions/...`)
- **AI**: OpenAI API 기반 음성 전사·TTS·세션 피드백(Hattie 프롬프트 체계) 등
- **선택·교사용 전사 비교**: 여러 전사 백엔드(OpenAI, Gemini, AWS, Azure)를 쓰는 코드가 있으며, 사용 시 해당 API 키가 필요합니다
- **교사**: 대시보드, 학생 상세, 전사 정확도 도구, 문항·생성 문항·교육과정 데이터, Excel 결과 내보내기 등 (`/teacher/*`)
- **문항 생성 에이전트**: 교육과정 PDF·요청을 바탕으로 한 생성 파이프라인(`src/lib/agents/`, `/api/agents/*`, `/api/curriculum/*` 등)

## 기술 스택

- **앱**: Next.js 15.5, React 19, TypeScript, Tailwind CSS 4
- **개발 서버**: `next dev --turbopack` (`npm run dev`)
- **백엔드·데이터**: Next.js Route Handlers, Supabase(Auth, PostgreSQL, Storage)
- **AI·클라우드 SDK**: `openai`, `@google/generative-ai`, `@aws-sdk/client-s3`, `@aws-sdk/client-transcribe`
- **기타**: `pdf-parse`, `sharp`, `xlsx` 등
- **E2E**: Playwright (`playwright.config.ts`, `tests/`)

## 시작하기

### 1. 저장소와 의존성

```bash
git clone <repository-url>
cd aieebss
npm install
```

### 2. 환경 변수

[env.example](env.example)를 참고해 **`.env.local`** 을 만듭니다. 이 파일과 실제 키 값은 **Git에 커밋하지 마세요** (`.gitignore`에 `.env*` 포함).

**필수(기본 동작에 가깝게 쓸 때)**

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용. RLS를 우회하는 관리 작업·일부 API에 사용. 클라이언트 번들에 넣지 않음 |
| `OPENAI_API_KEY` | 전사, 채점·피드백, TTS 등 OpenAI 호출 |

**선택(기능별)**

| 변수 | 용도 |
|------|------|
| `GOOGLE_AI_API_KEY` | Gemini 기반 전사 등 |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET_NAME` | AWS 전사·스토리지 연동 |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | Azure Speech 전사 |
| 마이그레이션 스크립트용 | `OLD_SUPABASE_URL`, `OLD_SUPABASE_SERVICE_ROLE_KEY` 등 (`scripts/` 주석 참고) |

배포(Vercel 등)에서는 동일 변수를 프로젝트 설정에 넣고, **Service Role·OpenAI·클라우드 키는 절대 공개 저장소나 클라이언트 코드에 넣지 않습니다.**

### 3. Supabase

최소한 `test_results`, `user_profiles`, `teacher_student_assignments` 및 녹음 스토리지 버킷(예: `student-recordings`) 등이 앱에서 사용됩니다. 에이전트·생성 문항·PDF 업로드 등은 추가 테이블·정책이 필요할 수 있습니다. 상세 스키마와 운영 절차는 저장소의 마이그레이션 스크립트와 문서를 함께 확인하세요.

- 교사·매핑 설정 개요: [docs/TEACHER_SETUP_GUIDE.md](docs/TEACHER_SETUP_GUIDE.md)

### 4. 개발 서버

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 엽니다.

### 5. 콘텐츠·오디오 생성 스크립트 (선택)

`scripts/` 아래에 교시별 오디오·이미지 생성 등 개발·콘텐츠용 스크립트가 있습니다. 실행 전 `.env.local`에 필요한 API 키를 두고, 레포지토리에는 생성물만 필요 시 커밋 여부를 판단하면 됩니다.

### 6. npm 스크립트 (데이터·배포 보조)

| 명령 | 설명 |
|------|------|
| `npm run dev` | Turbopack 개발 서버 |
| `npm run build` / `npm run start` | 프로덕션 빌드·실행 |
| `npm run lint` | ESLint |
| `npm run migrate-database` | DB 마이그레이션 스크립트 (`scripts/migrate-database.ts`) |
| `npm run migrate-auth-only` | Auth 사용자만 마이그레이션 |
| `npm run migrate-storage` | 스토리지 마이그레이션 |
| `npm run deploy` | 자동 배포 스크립트 (`scripts/auto-deploy.ts`) |
| `npm run monitor` | 배포 모니터링 (`scripts/monitor-deployment.ts`) |

### 7. E2E 테스트

Playwright가 설정되어 있습니다. 실행 예:

```bash
npx playwright test
```

## 교사 화면 (요약)

- `/teacher/dashboard` — 담당 학생 요약·통계
- `/teacher/student-detail` — 학생별 상세
- `/teacher/transcription-accuracy` — 전사 정확도 관련 도구
- `/teacher/test-items`, `/teacher/generate-items`, `/teacher/curriculum-data` — 문항·생성·교육과정

## 배포

- [vercel.json](vercel.json) — API 라우트 `maxDuration`, CORS·보안 헤더, rewrite 등이 정의되어 있습니다. 배포 후 라우팅이 기대와 다르면 이 설정과 Next의 라우팅을 함께 검토하세요.
- Vercel 사용 시 GitHub 연결 후 환경 변수를 프로젝트에 등록합니다.

## 프로젝트 구조 (요약)

```
src/
├── app/
│   ├── api/
│   │   ├── submit-p1_alphabet/ … submit-p6_comprehension/   # 교시별 제출
│   │   ├── feedback/          # 세션 피드백
│   │   ├── tts/               # TTS
│   │   ├── teacher/           # 교사 API(내보내기, 학생 결과, 전사 통계 등)
│   │   ├── agents/            # 문항 생성 등
│   │   ├── curriculum/        # 교육과정 PDF
│   │   ├── generated-items/   # 생성 문항 CRUD·승인
│   │   └── …
│   ├── lobby/
│   ├── test/                  # p1_alphabet … p6_comprehension
│   ├── results/
│   ├── teacher/
│   └── page.tsx               # 로그인
├── components/
├── lib/
│   ├── agents/
│   ├── feedback/
│   ├── services/              # 전사 어댑터 등
│   ├── supabase/
│   └── …
└── middleware.ts              # 세션 갱신(인증 강제는 페이지·API에서 처리)
```

## 설정 파일

- [next.config.ts](next.config.ts) — 이미지 원격 패턴, 보안 헤더, `serverExternalPackages` 등
- [tsconfig.json](tsconfig.json)
- [playwright.config.ts](playwright.config.ts)

## 추가 문서

저장소 루트가 아니라 **`docs/`** 아래를 기준으로 합니다.

- [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) — 프로젝트 개요
- [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md) — 데모 가이드
- [docs/PRESENTATION_SLIDES.md](docs/PRESENTATION_SLIDES.md) — 발표 슬라이드 초안
- [docs/DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md), [docs/NEW_PROJECT_SETUP_GUIDE.md](docs/NEW_PROJECT_SETUP_GUIDE.md) 등 기타 운영·마이그레이션 문서

## 라이선스

저장소에 별도 `LICENSE` 파일이 없습니다. 사용·배포 조건이 필요하면 저장소 소유자에게 확인하거나 라이선스 파일을 추가하세요.
