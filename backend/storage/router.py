from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from s3_storage import (
    build_key,
    upload_fileobj,
    presigned_download,
    presigned_upload,
)

router = APIRouter(prefix="/storage", tags=["storage"])


@router.post("/upload")
async def upload_file(
    folder: str      = Form(...),  # dicom | nifti | reports | signatures | degrees
    sub_id: str      = Form(...),  # case_id or user_id
    file: UploadFile = File(...),
):
    try:
        s3_key = build_key(folder, sub_id, file.filename)
        upload_fileobj(file.file, s3_key, content_type=file.content_type)
        return {"success": True, "s3_key": s3_key}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download-url")
def download_url(s3_key: str):
    url = presigned_download(s3_key)
    return {"url": url, "expires_seconds": 3600}


@router.post("/presigned-upload-url")
def get_presigned_upload_url(
    folder: str,
    sub_id: str,
    filename: str,
    content_type: str = "application/octet-stream",
):
    s3_key = build_key(folder, sub_id, filename)
    url    = presigned_upload(s3_key, content_type)
    return {"upload_url": url, "s3_key": s3_key}

@router.get("/list-keys")
def list_s3_keys(prefix: str):
    """List all S3 keys under a given prefix — used to load multi-file DICOM series."""
    try:
        from s3_storage import s3, S3_BUCKET
        resp = s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=prefix)
        keys = [o["Key"] for o in resp.get("Contents", [])]
        return {"keys": keys, "count": len(keys)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/presigned-series")
def presigned_series(prefix: str):
    """Return presigned download URLs for all files under an S3 prefix."""
    try:
        from s3_storage import s3, S3_BUCKET, presigned_download
        resp = s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=prefix)
        urls = [
            {"key": o["Key"], "url": presigned_download(o["Key"])}
            for o in resp.get("Contents", [])
            if o["Key"].lower().endswith(".dcm")
        ]
        return {"urls": urls, "count": len(urls)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
