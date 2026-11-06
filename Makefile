# CredFlow: lệnh phát triển. Recipe là POSIX sh.

.PHONY: setup db-up db-down db-generate db-migrate db-seed build-packages dev dev-packages dev-api dev-worker dev-web test test-int typecheck lint format eval synth

# Cài deps từ lockfile, bật Postgres và Redis, chạy migration, seed staff giả lập.
# Chạy lại an toàn: migration đã áp thì bỏ qua, seed không sinh dòng trùng.
setup:
	pnpm install --frozen-lockfile
	$(MAKE) db-up
	$(MAKE) db-migrate
	$(MAKE) db-seed

# --wait: chờ healthcheck của Postgres và Redis xanh rồi mới trả về.
db-up:
	docker compose up -d --wait db redis

db-down:
	docker compose down

# Sinh file migration từ apps/api/src/db/schema.ts → apps/api/drizzle/ (commit file sinh ra).
db-generate:
	pnpm --filter @credflow/api db:generate

# Chạy migration chưa áp vào DATABASE_URL (Postgres phải đang chạy: make db-up).
db-migrate:
	pnpm --filter @credflow/api db:migrate

# Seed staff giả lập; chạy lại không sinh dòng trùng.
db-seed: build-packages
	pnpm --filter @credflow/api db:seed

# packages/* build bằng tsc ra dist/: lúc chạy, node/vitest/tsx đọc dist (ADR 0003).
build-packages:
	pnpm --filter "./packages/*" build

# API (127.0.0.1:8787), worker (không mở cổng), web (localhost:3000) và tsc --watch cho packages chạy song song.
dev:
	@$(MAKE) -j4 dev-packages dev-api dev-worker dev-web

dev-packages: build-packages
	pnpm --filter "./packages/*" --parallel dev

dev-api: build-packages
	pnpm --filter @credflow/api dev

dev-worker: build-packages
	pnpm --filter @credflow/api dev:worker

dev-web: build-packages
	pnpm --filter @credflow/web dev

test: build-packages
	pnpm -r --if-present test

# Integration test của apps/api trên Postgres test (cổng 5433, tmpfs) và Redis thật.
test-int: build-packages
	docker compose up -d --wait db-test redis
	pnpm --filter @credflow/api test:int

typecheck:
	pnpm -r --if-present typecheck

lint:
	pnpm exec eslint .
	pnpm exec prettier --check .
	node --test tools/lint/*.test.mjs

# Sửa định dạng mọi file theo .prettierrc (make lint chỉ kiểm, không sửa).
format:
	pnpm exec prettier --write .

# Chạy golden set qua LlmService + rule engine thật → eval/runs/, eval/report.md (plan 18).
# Cần ANTHROPIC_API_KEY. Có cache LLM ở eval/cache/; đổi code gọi LLM thì: make eval ARGS=--no-cache
eval: build-packages
	pnpm --filter @credflow/api eval $(ARGS)

# Sinh thẻ CPR giả lập + đáp án → data/synth/cpr/ (plan 19). SEED= tuỳ chọn (mặc định 1).
# Lần đầu cần Chromium: pnpm --filter @credflow/synth exec playwright install chromium
synth: build-packages
	pnpm --filter @credflow/synth run synth $(if $(SEED),--seed $(SEED))
