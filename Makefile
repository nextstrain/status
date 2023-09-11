SHELL := bash -euo pipefail

build := build

.DELETE_ON_ERROR:

all: $(build)/pathogen-workflows.html $(build)/index.html

$(build)/pathogen-workflows.html: $(build)/pathogen-workflows.json $(build)/pathogen-workflows.css $(build)/pathogen-workflows.js $(build)/luxon.min.js pathogen-workflows.html.js | $(build) node_modules
	./pathogen-workflows.html.js < $< > $@

$(build)/pathogen-workflows.json: $(build)/%.json: %.sql | $(build)
	steampipe query --output json $< > $@

copied := \
	$(build)/pathogen-workflows.css \
	$(build)/pathogen-workflows.js \
	$(build)/index.html

$(copied): $(build)/%: % | $(build)
	cp $< $@

$(build)/luxon.min.js: node_modules/luxon/build/global/luxon.min.js | $(build)
	cp $< $@

node_modules/%: | node_modules
	@# Try to repair partial node_modules/.
	[[ -e $@ ]] || npm ci

node_modules:
	npm ci

$(build):
	mkdir -p $(build)
