SHELL := bash -euo pipefail

.PHONY: workflow-runs.html
.DELETE_ON_ERROR:

workflow-runs.html: workflow-runs.json luxon.min.js
	./generate.js > $@

workflow-runs.json: %.json: %.sql
	steampipe query --output json $< > $@

luxon.min.js: node_modules/luxon/build/global/luxon.min.js
	cp $< $@
