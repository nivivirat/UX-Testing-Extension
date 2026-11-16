// Drawing marks + producing the three export images (content script).
// Shapes are stored in image pixels:  box / redact: { type, x, y, w, h }   arrow: { type, x1, y1, x2, y2 }
// box/arrow carry { fid } = the problem (finding) they belong to; the badge shows that problem's number.
(function (K) {
  'use strict';
  const RED = '#E5484D';
  const BLUE = '#0D99FF';
  const R = {};

  R.unit = (W) => Math.max(1, W / 1280);

  R.normRect = (s) => ({
    x: Math.min(s.x, s.x + s.w),
    y: Math.min(s.y, s.y + s.h),
    w: Math.abs(s.w),
    h: Math.abs(s.h),
  });

  function newCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function pixelate(ctx, src, r, block) {
    const { x, y, w, h } = R.normRect(r);
    if (w < 1 || h < 1) return;
    const sw = Math.max(1, Math.round(w / block));
    const sh = Math.max(1, Math.round(h / block));
    const tmp = newCanvas(sw, sh);
    tmp.getContext('2d').drawImage(src, x, y, w, h, 0, 0, sw, sh);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, sw, sh, x, y, w, h);
    ctx.restore();
  }

  /** Base image with every redaction applied. Unredacted pixels never reach an export. */
  R.buildRedacted = (img, shapes) => {
    const c = newCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const block = Math.max(10, Math.round(14 * R.unit(img.width)));
    for (const s of shapes) if (s.type === 'redact') pixelate(ctx, img, s, block);
    return c;
  };

  function badge(ctx, n, x, y, u) {
    const r = 13 * u;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = RED;
    ctx.fill();
    ctx.lineWidth = 2.5 * u;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(14 * u)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, y + 0.5 * u);
    ctx.restore();
  }

  function stroked(ctx, u, path) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 6 * u;
    path();
    ctx.stroke();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 3 * u;
    path();
    ctx.stroke();
    ctx.restore();
  }

  /** n: problem number for the badge (null = no badge). */
  R.drawShape = (ctx, s, W, n) => {
    const u = R.unit(W);
    if (s.type === 'redact') {
      const r = R.normRect(s);
      ctx.save();
      ctx.setLineDash([6 * u, 4 * u]);
      ctx.strokeStyle = 'rgba(17,24,39,.5)';
      ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    } else if (s.type === 'box') {
      const r = R.normRect(s);
      stroked(ctx, u, () => {
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
      });
      if (n) badge(ctx, n, r.x, r.y, u);
    } else if (s.type === 'arrow') {
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const L = 18 * u;
      stroked(ctx, u, () => {
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(s.x2 - L * Math.cos(ang - 0.45), s.y2 - L * Math.sin(ang - 0.45));
        ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(s.x2 - L * Math.cos(ang + 0.45), s.y2 - L * Math.sin(ang + 0.45));
      });
      if (n) badge(ctx, n, s.x1, s.y1, u);
    }
  };

  R.drawOutline = (ctx, r, W) => {
    if (!r) return;
    const u = R.unit(W);
    ctx.save();
    ctx.setLineDash([8 * u, 5 * u]);
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(r.x - 2 * u, r.y - 2 * u, r.w + 4 * u, r.h + 4 * u);
    ctx.restore();
  };

  /**
   * Returns canvases { annotated, element|null }. The annotated image is width-capped; the element
   * crop is taken from the full-resolution (redacted) screenshot.
   * numberOf(shape) -> problem number. elementRect in image px.
   */
  R.renderOutputs = (img, shapes, { numberOf = () => null, elementRect = null, outline = true, margin = 16, maxWidth = 1920 } = {}) => {
    const W = img.width;
    const red = R.buildRedacted(img, shapes);
    let ann = newCanvas(W, img.height);
    const actx = ann.getContext('2d');
    actx.drawImage(red, 0, 0);
    if (outline) R.drawOutline(actx, elementRect, W);
    for (const s of shapes) if (s.type !== 'redact') R.drawShape(actx, s, W, numberOf(s));
    // Keep the full screenshot light: cap its width (the element crop below keeps full detail).
    if (W > maxWidth) {
      const k = maxWidth / W;
      const small = newCanvas(maxWidth, Math.round(img.height * k));
      const sctx = small.getContext('2d');
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(ann, 0, 0, small.width, small.height);
      ann = small;
    }

    let element = null;
    if (elementRect) {
      const x = Math.max(0, Math.floor(elementRect.x - margin));
      const y = Math.max(0, Math.floor(elementRect.y - margin));
      const x2 = Math.min(W, Math.ceil(elementRect.x + elementRect.w + margin));
      const y2 = Math.min(img.height, Math.ceil(elementRect.y + elementRect.h + margin));
      if (x2 - x >= 2 && y2 - y >= 2) {
        element = newCanvas(x2 - x, y2 - y);
        element.getContext('2d').drawImage(red, x, y, x2 - x, y2 - y, 0, 0, x2 - x, y2 - y);
      }
    }
    return { annotated: ann, element };
  };

  K.render = R;
})((globalThis.KQA = globalThis.KQA || {}));
