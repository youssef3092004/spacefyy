Create device (with image):

curl -X POST "http://localhost:3000/api/v1/devices/create" \
 -H "Authorization: Bearer <TOKEN>" \
 -F "branchId=<BRANCH_ID>" \
 -F "name=Arcade Machine" \
 -F "type=OTHER" \
 -F "image=@/path/to/image.jpg"

Update device (with image):

curl -X PATCH "http://localhost:3000/api/v1/devices/update/<BRANCH_ID>/<DEVICE_ID>" \
 -H "Authorization: Bearer <TOKEN>" \
 -F "name=Updated Name" \
 -F "image=@/path/to/new-image.png"

Notes:

- Replace `<TOKEN>`, `<BRANCH_ID>`, and `<DEVICE_ID>` with real values.
- The `image` field is handled by multer; allowed types: JPG, PNG, GIF, WebP. Max size: 4MB.
- The endpoint will upload the image to Cloudinary and store the returned URL in the device record under `image`.
