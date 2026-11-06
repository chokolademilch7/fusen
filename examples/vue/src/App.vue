<template>
  <main>
    <h1>Internal Tool Redesign Proposal</h1>
    <p class="lead">This is a rough draft. Stick a note anywhere something catches your eye.</p>

    <section id="overview">
      <h2>Goals</h2>
      <p>
        The goal is to fit everything from request to approval on one screen and drop the
        back-and-forth emails. In the current flow, waiting to hear back on returned requests takes
        the most time.
      </p>
    </section>

    <section id="schedule">
      <h2>Schedule</h2>
      <p>
        We plan a pilot in April and a rollout to every department in June. Since May overlaps with
        the accounting close, we will keep a hands-off week then.
      </p>
    </section>

    <!-- Only this section has no id. It shows that a pin sticks to an element
         without an id, and the acceptance test clicks the paragraph here. -->
    <section>
      <h2>Open questions</h2>
      <p>
        We have not decided how far to automate delegated approval when the approver is away. One
        option covers it with process, the other enforces it with permission settings.
      </p>
    </section>
  </main>

  <!-- This one line is all you paste. It is a custom element, not a Vue component,
       so isCustomElement in vite.config.ts declares it "outside Vue's control". -->
  <!-- hideItem is a function, so pass it as a property, not an attribute. Vue assigns
       it as a property automatically when the element has that property, but .prop makes it explicit. -->
  <fusen-widget route="/" :hideItem.prop="hideItem"></fusen-widget>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

// Hide notes whose body matches this. undefined means no filtering.
const hiddenBody = ref(undefined);
const hideItem = computed(() =>
  hiddenBody.value === undefined ? undefined : (item) => item.body === hiddenBody.value,
);

// Control hook for the acceptance test. It changes Vue state from outside, to check
// that the resulting hideItem reaches the <fusen-widget> property **through Vue**.
onMounted(() => {
  window.exampleControls = { hideBody: (body) => (hiddenBody.value = body) };
});
onUnmounted(() => {
  delete window.exampleControls;
});
</script>

<style>
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  color: #1f2328;
  line-height: 1.8;
}

main {
  max-width: 42rem;
  margin: 0 auto;
  padding: 3rem 1.5rem 6rem;
}

h1 {
  font-size: 1.6rem;
}

h2 {
  font-size: 1.1rem;
  margin-bottom: 0.2rem;
}

.lead {
  color: #57606a;
}

section {
  margin-top: 2.5rem;
}
</style>
