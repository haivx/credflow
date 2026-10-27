# CredFlow: lệnh phát triển. Recipe là POSIX sh.

.PHONY: setup db-up db-down dev dev-api dev-web test typecheck lint eval synth

# Cài deps từ lockfile và bật Postgres.
setup:
	pnpm install --frozen-lockfile
	$(MAKE) db-up

db-up:
	docker compose up -d db

db-down:
	docker compose down

# API (127.0.0.1:8787) và web (localhost:3000) chạy song song.
dev:
	@$(MAKE) -j2 dev-api dev-web

dev-api:
	pnpm --filter @credflow/api dev

dev-web:
	pnpm --filter @credflow/web dev

test:
	pnpm -r --if-present test

typecheck:
	pnpm -r --if-present typecheck

lint:
	pnpm exec eslint .
	pnpm exec prettier --check .

# Chạy golden set qua pipeline hiện tại → eval/report.md (stub đến P2).
eval:
	pnpm --filter @credflow/eval run eval

# Sinh giấy tờ giả lập + đáp án → data/synth/ (stub đến P2). SEED= tuỳ chọn.
synth:
	pnpm --filter @credflow/synth run synth $(if $(SEED),--seed $(SEED))
