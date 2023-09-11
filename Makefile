SHELL := bash -euo pipefail

build := build

.PHONY: index.html
.DELETE_ON_ERROR:

$(build)/workflow-runs.html: $(build)/workflow-runs.json $(build)/workflow-runs.css $(build)/workflow-runs.js $(build)/luxon.min.js | $(build)
	./generate.js > $@

$(build)/workflow-runs.json: $(build)/%.json: %.sql | $(build)
	steampipe query --output json $< > $@

$(build)/workflow-runs.%: workflow-runs.% | $(build)
	cp $< $@

$(build)/luxon.min.js: node_modules/luxon/build/global/luxon.min.js | $(build)
	cp $< $@

$(build):
	mkdir -p $(build)
