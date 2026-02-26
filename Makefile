.PHONY: dev package clean lint test publish

dev:
	@trap 'kill 0' EXIT; \
	bun --hot src/server/index.ts & \
	cd web && bun run dev

package: clean
	cd web && bun run build
	mkdir -p dist/web
	cp -r web/dist/* dist/web/

clean:
	rm -rf dist

lint:
	bun run lint
	cd web && bun run lint

test:
	bun test src/

publish: package
	npm publish
