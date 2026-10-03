# Additional display

Ideas for showing more of what fig-tree knows about an expression than the editor shows already: its issues, how a run went, cache status, the parameter cards, and the host's defaults on an operator's card. This records what to show, not how. The first three are in order of importance (Carl, October 2026); the rest are undecided or set aside.

## 1. Whether the expression always returns a value

fig-tree calls an expression _timeout-shielded_ when every top-level part has a constant `fallback`: its own, one the host sets in `operatorDefaults`, or, for a fragment call with no `fallback`, its body's. `validate()` reports it as `timeoutShielded`.

The name comes from the whole-evaluation `timeout`, but the property is broader. A runtime failure anywhere in a top-level part is caught by that part's fallback at the latest, and a constant can't fail, so nothing gets out. For a valid expression, shielded means:

- in throw mode, it always returns a value, timeout or not, and only a cancel (`signal`) makes it reject;
- in report mode, it comes back with no errors, apart from the timeout's own if one fires.

So it's worth showing whether or not the host sets a `timeout`, and worded as what it means ("Always returns a value") rather than as "timeout-shielded".

- **Sufficient, not necessary.** `{ $plus: [1, 2] }` can't fail but isn't shielded, and a computed `fallback` (`'$data.x'`) doesn't count, since it could fail itself. "Not shielded" means "could fail", not "will fail". Knowing which nodes truly can't fail would need each operator to say when it fails, which fig-tree doesn't attempt.
- **Where it doesn't hold,** the useful detail is which top-level parts have no constant fallback: each is a way out for a failure.
- **Source.** The flag is in `validate()`'s result, which is stable. The per-part detail is only in `inspect()`'s report (each top-level node's `timeoutFallback`), a dev tool whose shape is outside semver. The editor can work out a node's own constant fallback and one from `operatorDefaults`, but not a fragment body's, so the per-part detail probably needs a small, stable addition in fig-tree.

## 2. What a node returns

Each operator's and fragment call's hover card says what it can return.

- **Source.** An operator's declared `returns` (`getOperators()`), and a fragment's inferred `returns` (`getFragments()`, F11). Both are available now, and the picker already uses them to grey out what doesn't fit.
- **Wording** as the parameter cards word types (`describeType`): "Returns a string or null".
- **Open:** some operators' results depend on a parameter, so their declared type is the union of every case. `regex` gives a boolean, a string, an array or null by its `mode`, and `convert` gives whatever `to` names. The card could narrow the type where that parameter is a literal.

## 3. A fragment body's warnings

`getFragments()` reports each fragment's own warnings, such as an unread var or an unknown `$name` in its body. A call can't show them today, so an author never sees them.

- **Open:** where they go: on the call's card, or as a note in the messages area.

## Undecided

### Sample values for references

Hovering a reference shows the value it reads from the evaluation data (`evaluationData`), so `$data.user.name` shows `"Ada"`, and a wrong path shows as null before the sample-data warning comes into it. This isn't compiler information, but the editor has the data already.

The question is where. A reference's ▶ already evaluates it and shows the result in its card (plan, 10.7), so a value on hover may duplicate that.

### Where a failure would land

For any node, statically: which `fallback` would catch a failure there (its own, an ancestor's, or one from `operatorDefaults`), or, where none would, which top-level part of the result becomes null in report mode, or that the whole evaluation fails in throw mode. The run marks show this after a run; this would show it before one. It pairs with 1: together they'd say, for any node, what catches its failure and whether anything gets out of the expression. The editor could work most of it out from its classification and the operators' defaults.

## Set aside

- **Reads.** `getDependencies()` gives the `$data` paths an expression reads, and whether there are reads it can't list. Topic 7 of the design already has a "Reads" list beside the messages area as a do-later.
- **Requests.** Marking the nodes that make requests, directly or inside them.
- **Size against the limits.** `nodeCount` and `maxDepth`, counted through fragment calls, against the host's `maxNodes` and `maxDepth`. Only useful when the host sets limits, and only `inspect()` gives the counts.
