# Nextstrain status pages

Source code for producing high-level status pages of Nextstrain's operations at
<https://status.nextstrain.org>.

- Accesses data from GitHub's API via [Steampipe](https://steampipe.io) SQL queries
- Generates static HTML pages from the queried data
- Progressively enhances the pages with a dusting of client-side JS
- Updates every 5 minutes using GitHub Actions
- Publishes via GitHub Pages


## Development

Rebuild the status site by running:

    make

Output will be under `build/`.  Open an HTML page in your browser to view it:

    open build/pathogen-workflows.html

Requirements:

- [Node.js](https://nodejs.org/en/download) (at least 16, higher probably works too)
- [Steampipe](https://steampipe.io/downloads) CLI
- [turbot/net](https://hub.steampipe.io/plugins/turbot/net) steampipe plugin: `steampipe plugin install net`
- [turbot/githubsteampipe](https://hub.steampipe.io/plugins/turbot/githubsteampipe) steampipe plugin: `steampipe plugin install github`
- `GITHUB_TOKEN` environment variable to be set, e.g. using `GITHUB_TOKEN=$(gh auth token)`
- GNU Make
- PostgreSQL `psql` client (no server components necessary)

If you're just hacking on the HTML/CSS/JS of the status page and not the data
generation for it, then you can avoid the Steampipe requirement by running:

    make download

before `make` to fetch data from the status website instead of regenerating it
locally.


## Why this and not that?

_Why static generation?_
It's simple, robust, easy to host, and fast to load.  We don't need complex
status pages.

_Why Steampipe? Why not query the GitHub API directly?_
Gathering the data we need from the API directly would involve sending many
requests to many endpoints, pagination of results, manual joining of records,
and many other boring data tasks.  Steampipe either takes care of these for us
or they're tasks which are easily done in SQL.  SQL is a great fit for
expressing the data we need.  Steampipe's not perfect, but it made starting out
very easy.  If at some point we find it too lacking we can switch to another
approach.  The separation of data generation from data presentation is nice as
it does allow for other generation approaches without affecting presentation.

_What might be an alternate approach?_
GitHub [`workflow_run` webhooks][] received by a tiny app on Heroku (or
Fly.io/Netlify/Render/whatever) that records the webhook payloads in a local
database (e.g. SQLite or maybe PostgreSQL).  Dynamically rendered status pages.
This provides very up-to-date information without polling, though introduces
significant possibility for error/inconsistency due to missed webhook
deliveries and drift.  So we'd probably want to supplement the webhook data
with regularly polls for new data, e.g. by querying Steampipe and backfilling
the local database where necessary such that we're eventually consistent.

[`workflow_run` webhooks]: https://docs.github.com/en/webhooks/webhook-events-and-payloads#workflow_run
