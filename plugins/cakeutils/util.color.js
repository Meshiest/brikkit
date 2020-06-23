/* accepts parameters
 * h  Object = {h:x, s:y, v:z}
 * OR
 * h, s, v
*/
function hsv(h, s, v) {
    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return [
        Math.round(r * 255),
        Math.round(g * 255),
        Math.round(b * 255),
    ];
};

// convert a color into the weird linearRGB format
const linearRGB = rgba =>
  rgba.map((c, i) => i === 3
      ? i
      : Math.round(((c/255) > 0.04045 ? Math.pow((c/255) * (1.0 / 1.055) + 0.0521327, 2.4 ) : (c/255) * (1.0 / 12.92))*255)
  )

module.exports = {
    hsv,
    linearRGB,
}