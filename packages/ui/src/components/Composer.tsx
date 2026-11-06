import { createSignal, onMount, Show } from "solid-js";
import type { FeedbackLabels } from "../labels.ts";
import { Icon } from "./Icon.tsx";

/** Longest body the composer will let through. Mirrors the server-side limit the
 *  wire protocol has always enforced; the client check is a courtesy, the server
 *  is the authority. */
const MAX_BODY_LENGTH = 1000;

/** Bottom-sheet composer for mode.composing / mode.submitting / mode.error.
 *  Fixed to the viewport bottom with a safe-area inset so it stays usable
 *  above an on-screen keyboard. */
export function Composer(props: {
  submitting: boolean;
  error: boolean;
  onSubmit: (body: string) => void;
  onCancel: () => void;
  onRetry: () => void;
  labels: FeedbackLabels;
}) {
  const [body, setBody] = createSignal("");
  let field: HTMLTextAreaElement | undefined;

  // Focused explicitly rather than with the `autofocus` attribute: that
  // attribute is honoured when the browser parses/inserts the node into the
  // DOCUMENT, and this composer is inserted into a shadow root that the widget
  // attached at runtime, where it does not reliably fire. One line of code beats
  // an attribute that silently does nothing.
  onMount(() => field?.focus());

  const canSend = () =>
    body().trim().length > 0 && body().trim().length <= MAX_BODY_LENGTH && !props.submitting;

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    if (!canSend()) return;
    props.onSubmit(body().trim());
  };

  return (
    <div class="feedback-composer" data-feedback-ui>
      <form class="feedback-composer-form" onSubmit={submit}>
        <textarea
          ref={field}
          class="feedback-composer-textarea"
          placeholder={props.labels.composerPlaceholder}
          maxlength={MAX_BODY_LENGTH}
          rows="3"
          disabled={props.submitting}
          value={body()}
          onInput={(e) => setBody(e.currentTarget.value)}
        />
        <div class="feedback-composer-actions">
          <span class="feedback-composer-count muted">
            {props.labels.composerCount(body().trim().length, MAX_BODY_LENGTH)}
          </span>
          <div class="feedback-composer-buttons">
            <button
              type="button"
              class="feedback-composer-cancel ghost"
              onClick={props.onCancel}
              disabled={props.submitting}
            >
              {props.labels.composerCancel}
            </button>
            <button type="submit" class="feedback-composer-submit" disabled={!canSend()}>
              <Icon name="send" />
              {props.labels.composerSubmit}
            </button>
          </div>
        </div>
        <Show when={props.error}>
          <p class="error">
            {props.labels.composerError}
            <button
              type="button"
              class="feedback-composer-retry"
              onClick={props.onRetry}
              style={{ "margin-left": "8px" }}
            >
              {props.labels.composerRetry}
            </button>
          </p>
        </Show>
      </form>
    </div>
  );
}
