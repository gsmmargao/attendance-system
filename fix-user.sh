#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "🔧 Applying user.html fixes..."

# ---------- Fix 1: Force CPU backend in loadModels ----------
# Replace the loadModels function
python3 << 'PYEOF'
import re
with open('public/user.html', 'r') as f:
    html = f.read()

new_load_models = '''async function loadModels() {
  statusText.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Loading AI...';
  try {
    // Force CPU backend — WebGL often unavailable on Macs and some devices
    if (faceapi.tf) {
      try {
        await faceapi.tf.setBackend('cpu');
        await faceapi.tf.ready();
        console.log('✅ TF backend:', faceapi.tf.getBackend());
      } catch (backendErr) {
        console.warn('Could not set CPU backend, trying default:', backendErr);
      }
    }

    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    modelsReady = true;
    await startVideo();
  } catch (e) {
    statusText.innerHTML = '<i class="fas fa-exclamation-triangle mr-2 text-red-500"></i>AI load failed: ' + e.message;
    console.error('Face API load error:', e);
  }
}'''

# Replace the existing loadModels function (greedy match until the closing brace of the function)
pattern = r'async function loadModels\(\) \{.*?\n\}'
html = re.sub(pattern, new_load_models, html, count=1, flags=re.DOTALL)

# ---------- Fix 2: Replace the session check block to avoid 401 noise ----------
new_session_check = '''(async () => {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.status === 401) return; // not logged in — expected
    const me = await res.json();
    if (me.role === 'employee') {
      currentEmployee = me.employee;
      adminGeofence = me.geofence;
      showApp();
    }
  } catch (e) { /* ignore */ }
})();'''

pattern2 = r'\(async \(\) => \{\n  try \{\n    const me = await api\(\'/api/auth/me\'\);.*?\n\}\)\(\);'
html = re.sub(pattern2, new_session_check, html, count=1, flags=re.DOTALL)

# ---------- Fix 3: Add mobile-web-app-capable meta tag ----------
if 'mobile-web-app-capable' not in html:
    html = html.replace(
        '<meta name="apple-mobile-web-app-capable" content="yes">',
        '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">'
    )

with open('public/user.html', 'w') as f:
    f.write(html)

print('   ✅ user.html patched (loadModels + session check + meta tag)')
PYEOF

# ---------- Fix 4: Rewrite manifest.json clean (no BOM, single line) ----------
printf '%s' '{"name":"Attendance System","short_name":"Attendance","start_url":"/","display":"standalone","background_color":"#ffffff","theme_color":"#2563eb"}' > public/manifest.json
echo "   ✅ manifest.json rewritten"

# ---------- Verify ----------
echo ""
echo "🔍 Verification:"
echo -n "   - CPU backend override present: "
grep -q "setBackend('cpu')" public/user.html && echo "yes" || echo "NO — check manually"
echo -n "   - Session 401 check present:    "
grep -q "if (res.status === 401) return" public/user.html && echo "yes" || echo "NO — check manually"
echo -n "   - mobile-web-app-capable meta:  "
grep -q 'mobile-web-app-capable' public/user.html && echo "yes" || echo "NO — check manually"
echo -n "   - manifest.json size (bytes):   "
wc -c < public/manifest.json

echo ""
echo "✅ All fixes applied."
echo ""
echo "👉 Next: run 'npm run dev', then hard-refresh (Cmd+Shift+R) http://localhost:3000/user.html"

