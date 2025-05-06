#!/usr/bin/env node
import { groups, sort } from "d3-array";
import { DateTime } from "luxon";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import html from "./html.js";

const generatedAt = DateTime.utc();


// Read data from stdin
if (process.stdin.isTTY) {
  process.stderr.write("error: stdin is a tty; please provide data (e.g. pathogen-workflows.json) on stdin\n");
  process.exit(1);
}

const workflowRuns = JSON.parse(await readStream(process.stdin));

const runsByRepoAndWorkflow =
  groups(
    sort(
      workflowRuns,
      d => d.repository_full_name.toLowerCase(),
      d => d.workflow_name.toLowerCase(),
      d => -(new Date(d.created_at)),
      d => -d.id),
    d => d.repository_full_name,
    d => d.workflow_name );

const someFailure =
  runsByRepoAndWorkflow
    .flatMap(([, workflows]) =>
      workflows.map(([, runs]) =>
        runs[0].conclusion ?? runs[0].status))
    .some(x => x === "failure");


// Generate HTML to stdout
process.stdout.write(String(html`
  <!doctype html>
  <html class="inhibit-transitions">
    <head>
      <meta charset="utf-8">
      <title>Pathogen workflow status</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="icon" href="favicon-${someFailure ? "failure" : "success"}.svg" />
      <link rel="stylesheet" href="pathogen-workflows.css">
    </head>

    <body>
      <h1>Pathogen workflow status</h1>
      <nav aria-label="repo-list">
        <ul>
        ${
          runsByRepoAndWorkflow.map(([repository_full_name, workflows]) => html`
            <li>
              <a href="#${repoShortName(repository_full_name)}">
                ${
                  workflows
                    .map(([, runs]) => runs[0].conclusion ?? runs[0].status)
                    .some(x => x === "failure")
                  ? html`<span class="indicator failure">${indicator({conclusion: "failure"})} </span>`
                  : ""
                }${repoShortName(repository_full_name)}
              </a>
            </li>
          `)
        }
        </ul>
      </nav>
      <nav aria-labelledby="layout-toggle">
        <span id="layout-toggle">layout:</span>
        <a href="?">compact</a>
        / <a href="?time-relative">time-relative</a>
      </nav>
      <div id="warnings">
        <p id="offline-warning">
          You’re offline.  Automatic refresh is paused and information may be stale.
        </p>
        <p id="stale-warning" data-stale-threshold="PT30M">
          Page was generated
          <time datetime="${generatedAt}" data-relative>more than 30 minutes ago</time>.
          Information may be stale.
        </p>
      </div>
      <p id="generated-at">
        Generated at <time datetime="${generatedAt}">${generatedAt}</time>
        by <a href="https://github.com/nextstrain/status">nextstrain/status</a>
        for repos using our shared <a href="https://github.com/nextstrain/.github/blob/HEAD/.github/workflows/pathogen-repo-build.yaml"><code>pathogen-repo-build.yaml</code> workflow</a>.
      </p>
      ${
        runsByRepoAndWorkflow.map(([repository_full_name, workflows]) => html`
          <h2 id="${repoShortName(repository_full_name)}">
            <a href="https://github.com/${repository_full_name}">${repoShortName(repository_full_name)}</a>
            <a href="#${repoShortName(repository_full_name)}">#</a>
          </h2>
          ${
            workflows.map(([workflow_name, runs]) => html`
              <h3>
                <a href="https://github.com/${repository_full_name}/actions/${encodeURI(runs[0].workflow_path.replace(/^[.]github\//, ""))}">${workflow_name}</a>
                <span>(<a href="${runs[0].workflow_html_url}"><code>${runs[0].workflow_path}</code></a>)</span>
              </h3>
              <ol>
              ${
                runs.map(run => html`
                  <li class="${(run.conclusion ?? run.status).replace(/_/g, "-")}" data-run="${JSON.stringify(run)}">
                    <details>
                      <summary>${indicator(run)}</summary>
                      <div>
                        <time datetime="${run.created_at}">${run.created_at}</time>
                        <time datetime="${run.duration}">${run.duration}</time>
                        <a href="${run.html_url}">run details</a>
                        ${
                          run.attempt > 1
                            ? html`attempt #${run.attempt}`
                            : ''
                        }
                        <code>${run.event}</code>
                        <code>${run.commit_id.slice(0, 8)}</code>
                      </div>
                    </details>
                  </li>
                `)
              }
              </ol>
            `)
          }
        `)
      }
    </body>
    <script src="luxon.min.js"></script>
    <script src="pathogen-workflows.js"></script>
  </html>
`).replace(/^  /gm, '').trim() + "\n");


function repoShortName(repository_full_name) {
  return repository_full_name.replace(/^nextstrain\//, "");
}


function indicator(run) {
  switch (run.conclusion ?? run.status) {
    case "success":     return "✔";
    case "failure":     return "✘";
    case "in_progress": return "⋯";
    case "cancelled":   return "🛇";
    case "skipped":     return "⭘";
    default:            return run.conclusion;
  }
}


async function readStream(stream) {
  stream.setEncoding("utf-8");

  let data = "";

  for await (const chunk of stream) {
    data += chunk;
  }
  return data;
}
