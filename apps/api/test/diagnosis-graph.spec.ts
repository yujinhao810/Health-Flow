import assert from "node:assert/strict";
import test from "node:test";
import {
  createIntegrativeDiagnosisGraph,
  type DiagnosisGraphNodes,
} from "../src/integrative-diagnosis/integrative-diagnosis.graph";

function graphWithCallTrace(calls: string[]) {
  const node =
    (name: string, update = {}) =>
    async () => {
      calls.push(name);
      return update;
    };
  const nodes: DiagnosisGraphNodes = {
    gate: node("gate"),
    emergency: node("emergency"),
    initialDispatch: node("initial_dispatch"),
    westernInitial: node("western_initial", {
      westernEndedAt: new Date("2026-01-01T00:00:01.000Z"),
      coordinatorEvents: [
        {
          at: "2026-01-01T00:00:01.000Z",
          type: "western_complete",
          title: "western complete",
        },
      ],
    }),
    tcmInitial: node("tcm_initial", {
      tcmEndedAt: new Date("2026-01-01T00:00:02.000Z"),
      coordinatorEvents: [
        {
          at: "2026-01-01T00:00:02.000Z",
          type: "tcm_complete",
          title: "tcm complete",
        },
      ],
    }),
    initialJoin: async (state) => {
      calls.push("initial_join");
      assert.equal(
        state.westernEndedAt?.toISOString(),
        "2026-01-01T00:00:01.000Z",
      );
      assert.equal(state.tcmEndedAt?.toISOString(), "2026-01-01T00:00:02.000Z");
      assert.deepEqual(
        new Set(state.coordinatorEvents.map((event) => event.type)),
        new Set(["western_complete", "tcm_complete"]),
      );
      return {};
    },
    crossDispatch: node("cross_dispatch"),
    westernCross: node("western_cross"),
    tcmCross: node("tcm_cross"),
    crossJoin: node("cross_join"),
    integrator: node("integrator"),
    safety: node("safety"),
  };
  return createIntegrativeDiagnosisGraph(nodes);
}

test("diagnosis graph short-circuits all agents for an emergency", async () => {
  const calls: string[] = [];
  const graph = graphWithCallTrace(calls);

  await graph.invoke({
    redFlagResult: {
      safetyLevel: "emergency",
      mustSeekImmediateCare: true,
      findings: [],
    },
  });

  assert.deepEqual(calls, ["gate", "emergency"]);
});

test("diagnosis graph joins both expert stages before integration", async () => {
  const calls: string[] = [];
  const graph = graphWithCallTrace(calls);

  await graph.invoke({
    redFlagResult: {
      safetyLevel: "supportive",
      mustSeekImmediateCare: false,
      findings: [],
    },
  });

  assert.deepEqual(
    new Set(calls),
    new Set([
      "gate",
      "initial_dispatch",
      "western_initial",
      "tcm_initial",
      "initial_join",
      "cross_dispatch",
      "western_cross",
      "tcm_cross",
      "cross_join",
      "integrator",
      "safety",
    ]),
  );
  assert.ok(
    calls.indexOf("initial_dispatch") < calls.indexOf("western_initial"),
  );
  assert.ok(calls.indexOf("initial_dispatch") < calls.indexOf("tcm_initial"));
  assert.ok(calls.indexOf("western_initial") < calls.indexOf("initial_join"));
  assert.ok(calls.indexOf("tcm_initial") < calls.indexOf("initial_join"));
  assert.ok(calls.indexOf("western_cross") < calls.indexOf("cross_join"));
  assert.ok(calls.indexOf("tcm_cross") < calls.indexOf("cross_join"));
  assert.ok(calls.indexOf("cross_join") < calls.indexOf("integrator"));
  assert.ok(calls.indexOf("integrator") < calls.indexOf("safety"));
});
