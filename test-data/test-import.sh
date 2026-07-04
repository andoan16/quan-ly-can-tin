#!/bin/bash
set -e
cd /Users/andoan/WebstormProjects/quan-ly-can-tin

# Login
TOKEN=$(curl -s http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")

echo "=== Import Products ==="
curl -s http://localhost:4000/api/v1/products/import \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-data/products_200.xlsx" | python3 -m json.tool

echo ""
echo "=== Verify: count customers ==="
curl -s "http://localhost:4000/api/v1/customers?size=1" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(f'Total customers in DB: {d[\"total\"]}')"

echo ""
echo "=== Verify: count products ==="
curl -s "http://localhost:4000/api/v1/products?size=1" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(f'Total products in DB: {d[\"total\"]}')"

echo ""
echo "=== Test: empty file ==="
curl -s http://localhost:4000/api/v1/customers/import \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@apps/backend/package.json" | python3 -m json.tool 2>&1 | head -5

echo ""
echo "=== Test: no file ==="
curl -s http://localhost:4000/api/v1/customers/import \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool