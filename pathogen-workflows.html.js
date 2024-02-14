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
      d => d.repository_full_name,
      d => d.workflow_name,
      d => -d.created_at,
      d => -d.id),
    d => d.repository_full_name,
    d => d.workflow_name );


// Generate HTML to stdout
process.stdout.write(String(html`
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>Pathogen workflow status</title>
      <link rel="stylesheet" href="pathogen-workflows.css">
    </head>

    <body>
      <h1>Pathogen workflow status</h1>
      <nav>
        <a href="?">compact</a>
        / <a href="?time-relative">time-relative</a>
      </nav>
      <p>
        For repos using our shared <a href="https://github.com/nextstrain/.github/blob/HEAD/.github/workflows/pathogen-repo-build.yaml"><code>pathogen-repo-build.yaml</code> workflow</a>.
      </p>
      <p class="generated-at">
        Generated at <time datetime="${generatedAt}">${generatedAt}</time>.
      </p>
      ${
        runsByRepoAndWorkflow.map(([repository_full_name, workflows]) => html`
          <h2 id="">
            ${repository_full_name.replace(/^nextstrain\//, "")}
            <a href="#${repository_full_name.replace(/^nextstrain\//, "")}">#</a>
          </h2>
          ${
            workflows.map(([workflow_name, runs]) => html`
              <h3>
                ${workflow_name}
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


function indicator(run) {
  switch (run.conclusion ?? run.status) {
    case "success":     return "✔";
    case "failure":     return "✘";
    case "in_progress": return "⋯";
    case "cancelled":   return "🛇";
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
