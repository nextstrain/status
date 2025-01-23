/* Client-side JavaScript for the pathogen workflow status page.
 */


/* Automatically refresh the page as long as no run details are open.
 *
 * We don't use <meta name="refresh" …> because we want to check for open
 * details panels.
 *
 * Browsers should maintain page scroll position when doing this kind of
 * refresh (and in testing Firefox does).
 */
const REFRESH_SECONDS = 60; // seconds

function refreshIfAppropriate() {
  if (!navigator.onLine) {
    console.log("Offline… delaying refresh for another minute");
    setTimeout(refreshIfAppropriate, REFRESH_SECONDS * 1000);
    return;
  }
  if (document.querySelectorAll("details[open]").length) {
    console.log("<details> are open… delaying refresh for another minute");
    setTimeout(refreshIfAppropriate, REFRESH_SECONDS * 1000);
    return;
  }
  console.log("Refreshing…");
  document.location.reload();
}

setTimeout(refreshIfAppropriate, REFRESH_SECONDS * 1000);


/* Calculate values used by the time-relative layout and make them available to
 * the CSS.  This must happen client-side instead of at static generation time
 * since the calculations are relative to the current time.
 *
 * Do this early on so that values are available soon after initial page load
 * and definitely before we set data-* attributes from query params below.
 */
const endOfToday = luxon.DateTime.now().endOf("day");

for (const ol of document.getElementsByTagName("ol")) {
  let previousDaysAgo = null;
  let runOfTheDay = 0;
  let maxRunOfTheDay = 0;

  for (const li of ol.querySelectorAll("li[data-run]")) {
    const run = JSON.parse(li.dataset.run);

    const createdAt = luxon.DateTime.fromISO(run.created_at).endOf("day");
    const daysAgo = endOfToday.diff(createdAt, "days").days;

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


/* Gracefully upgrade datetimes to user's local time and ISO durations to
 * user-friendly descriptions.
 */
for (const time of document.getElementsByTagName("time")) {
  if (time.dateTime === time.textContent) {
    time.textContent = time.dateTime.startsWith("P")
      ? luxon.Duration.fromISO(time.dateTime).toHuman()
      : new Date(time.dateTime);
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


/* Allow keyboard navigation via h/j/k/l when viewing details for a run.  Handy
 * for quickly scanning thru details (e.g. durations, start times, etc.) about
 * a string of runs.
 */
document.addEventListener("keydown", event => {
  /* Ignore events involved in multi-key composition, see
   * <https://developer.mozilla.org/en-US/docs/Web/API/Element/keyup_event>.
   */
  if (event.isComposing || event.keyCode === 229)
    return;

  let adjacentDetails;

  switch (event.key) {
    case "h":
      adjacentDetails = queryPath("//details[@open]/ancestor::li/preceding-sibling::li[1]//details");
      break;
    case "l":
      adjacentDetails = queryPath("//details[@open]/ancestor::li/following-sibling::li[1]//details");
      break;

    /* XXX TODO: Preserve left/right position between lists, taking into
     * account layout (compact vs. time-relative).
     *   -trs, 5 June 2024
     */
    case "k":
      adjacentDetails = queryPath("//details[@open]/ancestor::ol/preceding-sibling::ol[1]//li//details");
      break;
    case "j":
      adjacentDetails = queryPath("//details[@open]/ancestor::ol/following-sibling::ol[1]//li//details");
      break;
  }

  if (adjacentDetails) {
    adjacentDetails.open = true;
    adjacentDetails.querySelector("summary").focus(); // so space/enter toggles the correct element
  }
});


/* Like querySelector(), but for XPath instead of CSS selectors.
 */
function queryPath(path, element = document) {
  return document.evaluate(path, element, null, XPathResult.FIRST_ORDERED_NODE_TYPE)?.singleNodeValue;
}


/* Reflect offline status for CSS.
 */
function updateOfflineStatus() {
  document.querySelector(":root").classList.toggle("offline", !navigator.onLine);
}

updateOfflineStatus();
window.addEventListener("online",  updateOfflineStatus);
window.addEventListener("offline", updateOfflineStatus);


/* Remove transition inhibition a short time after we're all done.
 */
setTimeout(() => document.querySelector(":root").classList.remove("inhibit-transitions"), 1000);
