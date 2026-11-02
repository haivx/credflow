# CredFlow: lệnh phát triển. Recipe là POSIX sh.

.PHONY: setup db-up db-down build-packages dev dev-packages dev-api dev-worker dev-web test typecheck lint format eval synth

# Cài deps từ lockfile, bật Postgres và Redis.
setup:
	pnpm install --frozen-lockfile
	$(MAKE) db-up

db-up:
	docker compose up -d db redis

db-down:
	docker compose down

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

typecheck:
	pnpm -r --if-present typecheck

lint:
	pnpm exec eslint .
	pnpm exec prettier --check .

# Sửa định dạng mọi file theo .prettierrc (make lint chỉ kiểm, không sửa).
format:
	pnpm exec prettier --write .

# Chạy golden set qua pipeline hiện tại → eval/report.md (stub đến P2).
eval: build-packages
	pnpm --filter @credflow/eval run eval

# Sinh giấy tờ giả lập + đáp án → data/synth/ (stub đến P2). SEED= tuỳ chọn.
synth: build-packages
	pnpm --filter @credflow/synth run synth $(if $(SEED),--seed $(SEED))
