# UI design

Home Timeline is a calm activity journal. The reader should quickly understand
what happened at home, then open the evidence when they want more detail.
This guide captures the current visual direction and the rules for extending it.

## Visual language

- Use the existing warm, muted palette: off-white backgrounds, quiet green accents, fine borders, and restrained shadows. Reserve category colors for activity cues.
- Reuse the CSS custom properties in `src/app/globals.css` for backgrounds, surfaces, text, borders, accents, and categories. That file is the source of truth for exact values and responsive rules; add a reusable token when a new role is needed.
- Use the locally bundled Inter Variable font and the existing type hierarchy: a prominent page title, readable event titles, and secondary time/metadata. Keep small secondary text legible at narrow widths and zoom.
- Keep the centered reading column and the timeline's time gutter, vertical line, and event nodes. Stories get a bordered surface and stronger hierarchy; ordinary events remain lightweight rows.
- Reuse `Icon`, category labels, and `Modal` from `src/components/timeline/primitives.tsx`. Use the existing Lucide icons and Radix dialog/popover primitives for consistent appearance and keyboard behavior.
- Keep CSS alongside the existing feature classes in `globals.css`. Tailwind is available, but a change should fit the surrounding styling approach. A second component kit or styling system needs a concrete reason.

## Information and interaction

Show a human-readable event first. Put state differences, entity identifiers,
context relationships, and sanitized source evidence in the inspector. Story
expansion reveals the underlying events in chronological order. Treat a story
as a timing interpretation, and distinguish that from available causal evidence.

Use friendly entity and room names when available. Keep copy short and specific:
what happened, what is loading, or what the reader can do next. Demo content must
stay visibly labeled. Loading, empty results, partial history, unavailable history,
and connection errors need distinct messages. Missing data is not evidence that
the home was quiet.

Preserve the reading position when live activity arrives. Offer “Back to now”
instead of moving the reader away from older activity. Search and filters apply
to the selected period, and active filters remain visible and removable.

## Responsive behavior, themes, and accessibility

- Extend the current responsive rules around 800px and 540px. On small screens, keep primary controls reachable and let dialogs scroll within the viewport. Avoid horizontal overflow with long names or evidence values.
- Support System, Light, and Dark themes through the existing tokens and theme preference. Check the actual rendered contrast of text, focus outlines, and category cues in both light and dark modes.
- Use real buttons, links, labels, and headings. Give icon-only controls accessible names, expose expanded/selected states, and retain visible keyboard focus. Color alone must not carry status.
- Preserve Radix focus management, Escape dismissal, and focus return when closing a dialog. New popovers and dialogs must work without a pointer.
- Keep touch targets comfortable; follow the existing 44px icon controls and coarse-pointer rules for compact actions. Do not make hover the only way to discover an action.
- Use brief, subtle motion to explain insertion and expansion. Honor both `MotionConfig reducedMotion="user"` and the CSS reduced-motion rules when adding animation.

These are requirements for changes, not a claim that the whole interface has
passed a formal accessibility audit.

## Browser checklist

Check the affected flow in demo mode and use the local fixture when connection
behavior matters. Inspect a desktop and a narrow mobile viewport, light and dark
themes, and keyboard operation. For animation changes, also enable reduced motion.

For changes shared across the timeline, verify:

- Story expand/collapse and event → entity history → event navigation.
- Search opening with both its button and Cmd/Ctrl+K, period selection, and filter removal.
- Settings, empty results, and long entity/room names without clipped controls.
- Arrival of new activity while reading older events, followed by “Back to now”.
- Connection loading/error/success and disconnect when those flows are touched.

Report what was actually checked. Use fake home data in screenshots and fixtures.
