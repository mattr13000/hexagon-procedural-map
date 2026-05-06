import * as THREE from 'three';

const _v = new THREE.Vector3();

export class HudOverlay {
  constructor(container) {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this._dpr = dpr;

    // CSS dimensions
    this._W = 110;
    this._H = 220;

    const canvas = document.createElement('canvas');
    canvas.width  = this._W * dpr;
    canvas.height = this._H * dpr;
    canvas.className = 'hud-canvas';
    Object.assign(canvas.style, {
      position:      'absolute',
      top:           '16px',
      right:         '16px',
      width:         `${this._W}px`,
      height:        `${this._H}px`,
      pointerEvents: 'none',
    });
    container.appendChild(canvas);

    this._ctx = canvas.getContext('2d');
    this._ctx.scale(dpr, dpr);
  }

  update(camera, controls) {
    const ctx = this._ctx;
    const W = this._W, H = this._H;
    ctx.clearRect(0, 0, W, H);

    // ── Compass ──
    const target  = controls.target;
    const dx = camera.position.x - target.x;
    const dz = camera.position.z - target.z;
    // heading: 0 = North (-Z), +π/2 = East (+X)
    const heading = Math.atan2(-dx, dz);
    this._drawCompass(ctx, W / 2, 58, 46, heading);

    // ── XYZ Gizmo ──
    this._drawGizmo(ctx, camera, W / 2, 162, 38);
  }

  _drawCompass(ctx, cx, cy, r, heading) {
    // Background
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.fillStyle   = 'rgba(8,8,18,0.72)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 1;
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-heading);

    // Tick marks
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth   = 1;
    for (let i = 0; i < 8; i++) {
      const a  = (i / 8) * Math.PI * 2;
      const r1 = r - 7, r2 = r - 1;
      ctx.beginPath();
      ctx.moveTo(Math.sin(a) * r1, -Math.cos(a) * r1);
      ctx.lineTo(Math.sin(a) * r2, -Math.cos(a) * r2);
      ctx.stroke();
    }

    // Cardinal labels (counter-rotated so text stays upright)
    const cardinals = [
      { t: 'N', a: 0,              col: '#ff6b6b' },
      { t: 'E', a: Math.PI * 0.5,  col: '#aed9e0' },
      { t: 'S', a: Math.PI,        col: '#aed9e0' },
      { t: 'W', a: Math.PI * 1.5,  col: '#aed9e0' },
    ];
    ctx.font         = 'bold 10px Courier New, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    for (const { t, a, col } of cardinals) {
      const lx = Math.sin(a) * (r - 15);
      const ly = -Math.cos(a) * (r - 15);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(heading);
      ctx.fillStyle = col;
      ctx.fillText(t, 0, 0);
      ctx.restore();
    }

    // North needle (red)
    const nl = r - 16;
    ctx.beginPath();
    ctx.moveTo(0, -nl);
    ctx.lineTo(-4.5, 4);
    ctx.lineTo(4.5, 4);
    ctx.closePath();
    ctx.fillStyle = '#ff4444';
    ctx.fill();

    // South needle (grey)
    ctx.beginPath();
    ctx.moveTo(0, nl);
    ctx.lineTo(-4.5, -4);
    ctx.lineTo(4.5, -4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();

    // Centre pin
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#cdd';
    ctx.fill();

    ctx.restore();

    // Label
    ctx.fillStyle    = 'rgba(174,217,224,0.55)';
    ctx.font         = '9px Courier New, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('COMPASS', cx, cy + r + 4);
  }

  _drawGizmo(ctx, camera, cx, cy, len) {
    // Background
    ctx.beginPath();
    ctx.arc(cx, cy, len + 18, 0, Math.PI * 2);
    ctx.fillStyle   = 'rgba(8,8,18,0.72)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 1;
    ctx.fill();
    ctx.stroke();

    // Project world axes via camera view matrix (rotation only)
    const mat = camera.matrixWorldInverse;
    const AXES = [
      { dir: new THREE.Vector3( 1,  0,  0), col: '#ef4444', label: 'X' },
      { dir: new THREE.Vector3( 0,  1,  0), col: '#22c55e', label: 'Y' },
      { dir: new THREE.Vector3( 0,  0, -1), col: '#4a90e2', label: 'Z' }, // -Z = North/forward
    ];

    const projected = AXES.map(({ dir, col, label }) => {
      _v.copy(dir).transformDirection(mat);
      // _v.x = right in screen space, _v.y = up in screen space
      return { sx: _v.x, sy: -_v.y, depth: _v.z, col, label };
    });

    // Draw back-to-front
    projected.sort((a, b) => a.depth - b.depth);

    ctx.font         = 'bold 10px Courier New, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    for (const { sx, sy, depth, col, label } of projected) {
      const ex = cx + sx * len;
      const ey = cy + sy * len;
      const alpha = depth > 0 ? 0.3 : 1.0; // dim axes pointing away from camera

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();

      ctx.fillStyle = col;
      ctx.fillText(label, ex + sx * 11, ey + sy * 11);
    }

    ctx.globalAlpha = 1;

    // Label
    ctx.fillStyle    = 'rgba(174,217,224,0.55)';
    ctx.font         = '9px Courier New, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ORIENT', cx, cy + len + 6);
  }
}
