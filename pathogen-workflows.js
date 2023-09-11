/* Client-side JavaScript for the pathogen workflow status page.
 */

/* Set query params as data-* attributes on the document so CSS can use them.
 * We do this at several possible points in time.
 */
function setDatasetKeysFromSearchParams(searchParams) {
  const rootElement = document.querySelector(":root");
  const oldKeys = new Set(Object.getOwnPropertyNames(rootElement.dataset));

  for (const [key, value] of searchParams) {
    // <https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset#name_conversion>
    const camelKey = key
      .toLowerCase()
      .replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());

    rootElement.dataset[camelKey] = value;
    oldKeys.delete(camelKey);
  }

  for (const oldKey of oldKeys) {
    delete rootElement.dataset[oldKey];
  }
}

/* Set at initial load.
 */
setDatasetKeysFromSearchParams((new URL(window.location)).searchParams);

/* Set when clicking links (e.g. in <nav>) that only change the query params.
 *
 * Converts these from full-page navigations to no-network pushState() changes.
 */
document.addEventListener("click", (event) => {
  if (event.target.tagName === "A") {
    // Fully-resolved URL
    const url = new URL(event.target.href);

    // Unresolved "href" attribute; must start with a query (?) part but may
    // also include an anchor/hash (#) part, which we account for.
    const href = event.target.getAttribute("href");

    if (href.startsWith("?")) {
      setDatasetKeysFromSearchParams(url.searchParams);
      history.pushState(null, "", href);
      event.preventDefault();
    }
  }
});

/* Set at user navigation (e.g. going back/forward) between History API entries
 * produced by pushState() above.
 */
window.addEventListener("popstate", (event) => {
  setDatasetKeysFromSearchParams((new URL(document.location)).searchParams);
});


/* Gracefully upgrade datetimes to user's local time
 */
for (const time of document.getElementsByTagName("time")) {
  if (time.dateTime === time.textContent) {
    time.textContent = new Date(time.dateTime);
  }
}


/* Close already open <detail>s when another one is opened.  The toggle event
 * does not bubble¹, so we can't attach a single listener for the whole
 * document.
 *
 * ¹ <https://developer.mozilla.org/en-US/docs/Web/API/HTMLDetailsElement/toggle_event>
 */
for (const details of document.querySelectorAll("details")) {
  details.addEventListener("toggle", event => {
    if (event.target.open) {
      for (const details of document.querySelectorAll("details[open]")) {
        if (details !== event.target) {
          details.removeAttribute("open");
        }
      }
    }
  });
}


/* Calculate values used by the time-relative layout and make them available to
 * the CSS.  This must happen client-side instead of at static generation time
 * since the calculations are relative to the current time.
 */
const now = luxon.DateTime.now().endOf("day");

for (const ol of document.getElementsByTagName("ol")) {
  let previousDaysAgo = null;
  let runOfTheDay = 0;
  let maxRunOfTheDay = 0;

  for (const li of ol.querySelectorAll("li[data-run]")) {
    const run = JSON.parse(li.dataset.run);

    const createdAt = luxon.DateTime.fromISO(run.created_at).endOf("day");
    const daysAgo = now.diff(createdAt, "days").days;

    if (previousDaysAgo === daysAgo) {
      runOfTheDay++;
    } else {
      runOfTheDay = 0;
    }

    li.style.setProperty("--data-days-ago", daysAgo);
    li.style.setProperty("--data-run-of-the-day", runOfTheDay);
    li.style.setProperty("--data-offset-left", `-${li.offsetLeft || 0}px`);

    previousDaysAgo = daysAgo;
    maxRunOfTheDay = Math.max(maxRunOfTheDay, runOfTheDay);
  }

  ol.style.setProperty("--data-max-run-of-the-day", maxRunOfTheDay);
}
