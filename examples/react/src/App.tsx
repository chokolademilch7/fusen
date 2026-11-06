// The widget is loaded with a relative side-effect import, not a workspace
// specifier, to show that loading it is "just read one prebuilt file".
// Once this runs, <fusen-widget> is registered and its IndexedDB store is connected.
import "../../../packages/lite/dist/fusen-lite.js";

import { useEffect, useState } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      // React does not know the types of unknown tags, so declare the minimum here.
      // The build is esbuild, so no type check runs. This declaration is for readers.
      "fusen-widget": { route?: string; hideItem?: (item: { body: string }) => boolean };
    }
  }
}

declare global {
  interface Window {
    // Control hook for the acceptance test. It changes React state from outside, to
    // check that the resulting hideItem reaches the <fusen-widget> property **through React**.
    exampleControls?: { hideBody: (body: string | undefined) => void };
  }
}

export function App() {
  // Hide notes whose body matches this. undefined means no filtering.
  const [hiddenBody, setHiddenBody] = useState<string | undefined>(undefined);
  useEffect(() => {
    window.exampleControls = { hideBody: setHiddenBody };
    return () => {
      delete window.exampleControls;
    };
  }, []);
  const hideItem =
    hiddenBody === undefined ? undefined : (item: { body: string }) => item.body === hiddenBody;

  return (
    <main>
      <h1>Internal Expense Reimbursement Guide</h1>

      <section id="overview">
        <h2>About this page</h2>
        <p>
          This page explains how to file expense claims. If anything here does not match how it
          actually works, stick a note right on that spot and let us know.
        </p>
      </section>

      <section id="deadline">
        <h2>Deadline</h2>
        <p>Submit claims by the last day of each month. Late claims roll over to the next month.</p>
      </section>

      {/* A section without an id: left unmarked on purpose, to check that anchors
          do not depend on ids. */}
      <section>
        <h2>Receipts</h2>
        <p>
          For paper receipts, attach a photo and you do not need to submit the original. Keep the
          original yourself until the end of the fiscal year.
        </p>
      </section>

      {/*
        Uses React 19.2.8. React 19 supports custom elements officially, and
        string values are written out as attributes as is (up to 18, unknown props
        could be dropped). route is a plain string, so it goes through as an attribute.
        hideItem is a function, so React sees that the element has that property
        and assigns it as a property, not an attribute.
      */}
      <fusen-widget route="/" hideItem={hideItem} />
    </main>
  );
}
