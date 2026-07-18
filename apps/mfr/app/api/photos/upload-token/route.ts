// Client-upload token endpoint for gallery photos. The browser streams the
// original straight to Vercel Blob (bypassing the Server Action body limit) and
// this route authorizes each upload + constrains type/size. Processing happens
// afterwards in the finalizeUpload server action the client calls once upload()
// resolves — so there is no onUploadCompleted callback (it never fires on
// localhost anyway).

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { requireApproved } from '@/lib/authz'
import { ACCEPTED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '@/lib/photos/constants'

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async () => {
        // Gate: any approved, signed-in member may upload.
        await requireApproved()
        return {
          allowedContentTypes: [...ACCEPTED_UPLOAD_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        }
      },
    })
    return Response.json(json)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 })
  }
}
