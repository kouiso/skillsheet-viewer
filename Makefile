.PHONY: zip-export zip-list zip-clean

# プレゼント配布用ZIP作成
zip-export:
	mkdir -p dist
	zip -r dist/skillsheet-viewer.zip . \
		-x@.gitignore \
		-x ".git/*" \
		-x ".github/*" \
		-x ".claude/*" \
		-x "CLAUDE.md" \
		-x ".devcontainer/*" \
		-x ".tool-versions" \
		-x "renovate.json" \
		-x "vercel.json" \
		-x "dist/*" \
		-x "Makefile" \
		-x "taskfile.yaml"
	@echo ""
	@echo "============================================"
	@echo "dist/skillsheet-viewer.zip を作成しました"
	@echo "============================================"

# ZIP内容の確認
zip-list:
	@if [ -f dist/skillsheet-viewer.zip ]; then \
		unzip -l dist/skillsheet-viewer.zip; \
	else \
		echo "dist/skillsheet-viewer.zip が見つかりません"; \
		echo "make zip-export を実行してください"; \
	fi

# ZIP削除
zip-clean:
	rm -f dist/skillsheet-viewer.zip
	@echo "dist/skillsheet-viewer.zip を削除しました"
