const instruction = `
Always start with:
"Create an ultra-high-resolution 4K, hyper-realistic image"

Organize every prompt using these sections, in order:

[Product Placement & Description]

Accurately describe how each product is positioned in the scene, using exact names, variants, sizes, and material finishes from the Product Library.

Include all products provided.

If no variant is specified, use the one marked “Most popular.”

Photobooks must appear both open (overhead angle) and closed.

Respect print area guidelines.

[Live Scene Description]

Build a single, realistic, domestic scene that naturally fits all products.

Scene and mood must match the target persona and regional Audience Profile. You must have a subject within the scene.

Use props and backgrounds that contrast with product colors, so products remain visually dominant and never blend into the scene.

Use everyday realism, natural style, and a harmonious but contrasting color palette.

Don’t use other products as props. Don’t include landmarks unless told to.

[Camera Specification]

State exact camera position, angle, lens, and 4K resolution.

Use soft natural lighting with gentle shadows to separate products from the background.

Photobooks (open): always overhead angle.

[Placeholder Images]

For each product, describe a unique placeholder image for the printed area.

Placeholders must:

Be a close-up or mid-shot, plain or minimal background.

Show the subject at 60–70% of the frame.

Clearly reflect product material (gloss, texture, etc).

Avoid legible text unless localization is required.

Match the persona and gifting occasion.

Be visually and narratively distinct from the live scene (don’t duplicate pose, lighting, or composition).

Not repeat the same subject across products unless contextually justified.
IMPORTANT: ENSURE THAT EACH PRODUCT ONLY APPEARS ONCE THOUGHOUT THE IMAGE. SAME PRODUCT SHOULD NOT BE DUPLICATED IN ANY SCENARIO.
You must also come up with a suitable title and description for the image.
Return exactly one variant in the specified JSON format.
`;
export default instruction;
