import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CCard,
  CCardBody,
  CAvatar,
  CButton,
  CRow,
  CCol,
  CFormSelect,
  CAlert,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CFormRange,
} from "@coreui/react";
import Cropper from "react-easy-crop";
import "./Profile.css";
import api from "../../../shared/api/axios";

// -------------------- helpers --------------------
function getFileKind(file) {
  const t = (file?.type || "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t === "application/pdf") return "pdf";
  return "other";
}

function extFromFile(file, fallback = "png") {
  const name = (file?.name || "").toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".pdf")) return "pdf";
  return fallback;
}

async function getCroppedImageBlob(imageSrc, cropPixels, outType = "image/png") {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = cropPixels.width;
  canvas.height = cropPixels.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    img,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    cropPixels.width,
    cropPixels.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), outType, 0.95);
  });
}

// Default avatars list (served by FastAPI under /uploads/radiologist/avatars/)
const DEFAULT_AVATARS = [
  "female_1.jpg",
  "female_2.jpg",
  "female_3.jpg",
  "female_4.jpg",
  "female_5.jpg",
  "male_1.jpg",
  "male_2.jpg",
  "male_3.jpg",
  "male_4.jpg",
];

// stable pick based on userId (same user gets same default)
const pickDefaultAvatar = (userId) => {
  const s = String(userId || "0");
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return DEFAULT_AVATARS[sum % DEFAULT_AVATARS.length];
};

const Profile = () => {
  const auth = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("auth") || "null");
    } catch {
      return null;
    }
  }, []);

  const userId = auth?.userId;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  // previews
  const [photoPreview, setPhotoPreview] = useState("");
  const [degreeName, setDegreeName] = useState("");
  const [signaturePreview, setSignaturePreview] = useState("");

  // form state
  const [qualification, setQualification] = useState("");

  // alerts
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // hidden input refs (reliable picker)
  const photoInputRef = useRef(null);
  const degreeInputRef = useRef(null);
  const signInputRef = useRef(null);

  // upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState(null); // photo|degree|signature
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedKind, setSelectedKind] = useState(null); // image/pdf/other

  // crop state
  const [imageSrc, setImageSrc] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const [savingUpload, setSavingUpload] = useState(false);

  // Keep the /api prefix so the Vite dev proxy forwards uploads to FastAPI's
  // StaticFiles mount. Stripping /api makes the URL hit Vite's SPA fallback
  // (returns index.html, not the image), which is why the avatar fails to load.
  const baseUploads = useMemo(() => {
    const b = (api?.defaults?.baseURL || "").replace(/\/$/, "");
    if (!b) return `${window.location.origin}/uploads/`;
    return `${b}/uploads/`;
  }, []);

  const showSuccess = (m) => {
    setSuccess(m);
    setTimeout(() => setSuccess(""), 3000);
  };

  const showError = (m) => {
    setError(m);
    setTimeout(() => setError(""), 4000);
  };

  const notifyHeaderAvatar = () => {
    window.dispatchEvent(new Event("avatar-updated"));
  };

  const fetchProfile = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const res = await api.get(`/radiology/profile/${userId}`);
      const data = res.data?.data;

      setProfile(data);
      setQualification((data?.qualification || "").toUpperCase());

      // ----- Photo (DB -> else default random) -----
      const savedAvatar = localStorage.getItem("avatarUrl") || "";

      if (data?.profile_image_path) {
        const url = baseUploads + data.profile_image_path;
        setPhotoPreview(url);
        localStorage.setItem("avatarUrl", url);
        notifyHeaderAvatar();
      } else {
        if (savedAvatar) {
          setPhotoPreview(savedAvatar);
        } else {
          const def = baseUploads + "radiologist/avatars/" + pickDefaultAvatar(userId);
          setPhotoPreview(def);
          localStorage.setItem("avatarUrl", def);
          notifyHeaderAvatar();
        }
      }

      // ----- Degree -----
      setDegreeName(data?.degree_path ? data.degree_path.split("/").pop() : "");

      // ----- Signature -----
      setSignaturePreview(data?.signature_path ? baseUploads + data.signature_path : "");
    } catch (e) {
      showError(e.response?.data?.detail || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line
  }, [userId]);

  if (!auth) return <p className="text-center">Not logged in</p>;
  if (loading) return <p className="text-center">Loading...</p>;
  if (!profile) return <p className="text-center">Profile not found</p>;

  const stripDrPrefix = (s) =>
    String(s || "").replace(/^(?:dr\.?\s*)+/i, "").trim();
  const _initFn = stripDrPrefix(profile.first_name);
  const _initLn = stripDrPrefix(profile.last_name);
  const initials =
    ((_initFn[0] || "U") + (_initLn[0] || "U")).toUpperCase();

  const lockedName = `${profile.first_name || ''} ${profile.last_name || ''}`
    .replace(/\s+/g, ' ')
    .trim();

  const lockedEmail = profile.email || "";

  const openPicker = (target) => {
    setError("");
    setSuccess("");
    if (target === "photo") photoInputRef.current?.click();
    if (target === "degree") degreeInputRef.current?.click();
    if (target === "signature") signInputRef.current?.click();
  };

  const onPickFile = (target, file) => {
    if (!file) return;

    const kind = getFileKind(file);

    setUploadTarget(target);
    setSelectedFile(file);
    setSelectedKind(kind);

    // reset crop
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);

    if (kind === "image") {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
    } else {
      setImageSrc("");
    }

    setUploadModalOpen(true);
  };

  const onCropComplete = (_, croppedPixels) => setCroppedAreaPixels(croppedPixels);

  const closeUploadModal = () => {
    setUploadModalOpen(false);
    setUploadTarget(null);
    setSelectedFile(null);
    setSelectedKind(null);
    setSavingUpload(false);

    if (imageSrc?.startsWith("blob:")) URL.revokeObjectURL(imageSrc);
    setImageSrc("");
  };

  const doUpload = async () => {
    if (!uploadTarget || !selectedFile) return;

    try {
      setSavingUpload(true);
      setError("");
      setSuccess("");

      const endpointMap = {
        photo: `/radiology/profile/${userId}/upload-photo`,
        degree: `/radiology/profile/${userId}/upload-degree`,
        signature: `/radiology/profile/${userId}/upload-signature`,
      };

      const endpoint = endpointMap[uploadTarget];
      const form = new FormData();

      // IMAGE -> upload cropped image
      if (selectedKind === "image" && croppedAreaPixels && imageSrc) {
        const outType = "image/png";
        const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, outType);
        const ext = extFromFile(selectedFile, "png");
        const fileName = `${uploadTarget}.${ext === "jpg" ? "jpg" : "png"}`;
        const croppedFile = new File([blob], fileName, { type: outType });

        form.append("file", croppedFile);

        const localPrev = URL.createObjectURL(croppedFile);

        if (uploadTarget === "photo") {
          setPhotoPreview(localPrev);
          localStorage.setItem("avatarUrl", localPrev);
          notifyHeaderAvatar();
        }

        if (uploadTarget === "signature") {
          setSignaturePreview(localPrev);
        }
      } else {
        // PDF/other -> upload directly
        form.append("file", selectedFile);

        if (uploadTarget === "degree") {
          setDegreeName(selectedFile.name);
        }
      }

      await api.post(endpoint, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      showSuccess("Uploaded successfully");
      await fetchProfile();
      closeUploadModal();
    } catch (e) {
      showError(e.response?.data?.detail || "Upload failed");
      setSavingUpload(false);
    }
  };

  // save profile — generates GENRAD-RAD-xxxxxx rad_id; degree/signature not required
  const handleSaveProfile = async () => {
    try {
      setError("");
      setSuccess("");

      const form = new FormData();
      form.append("qualification", qualification || "MD");

      const res = await api.post(`/radiology/profile/${userId}/save`, form);

      const newRadId = res?.data?.rad_id;
      if (newRadId) {
        showSuccess(`Profile saved. Radiologist ID: ${newRadId}`);
      } else {
        showSuccess("Profile saved successfully");
      }
      await fetchProfile();
    } catch (e) {
      showError(e.response?.data?.detail || "Failed to save profile");
    }
  };

  return (
    <>
      {/* Hidden Inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/png,image/jpeg"
        style={{ display: "none" }}
        onChange={(e) => onPickFile("photo", e.target.files?.[0])}
      />

      <input
        ref={degreeInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        style={{ display: "none" }}
        onChange={(e) => onPickFile("degree", e.target.files?.[0])}
      />

      <input
        ref={signInputRef}
        type="file"
        accept="image/png,image/jpeg"
        style={{ display: "none" }}
        onChange={(e) => onPickFile("signature", e.target.files?.[0])}
      />

      <CRow className="justify-content-center">
        <CCol md={10} lg={7}>
          <CCard className="profile-card shadow-sm">
            <CCardBody>
              {error && <CAlert color="danger">{error}</CAlert>}
              {success && <CAlert color="success">{success}</CAlert>}

              {/* Avatar */}
              <div className="profile-avatar-section">
                <CAvatar
                  src={photoPreview}
                  className="profile-avatar"
                  color="secondary"
                  onError={() => {
                    // if url fails, fallback to initials
                    setPhotoPreview("");
                    localStorage.removeItem("avatarUrl");
                    notifyHeaderAvatar();
                  }}
                >
                  {!photoPreview && initials}
                </CAvatar>

                <div className="upload-center mt-3">
                                <CButton
                  className="theme-btn-sm"
                  size="sm"
                  onClick={() => openPicker("photo")}
                >
                  Upload Image
                </CButton>

                </div>
              </div>

              {/* Box */}
              <div className="profile-box">
                <div className="profile-row-new">
                  <div className="label">Name</div>
                  <div className="value">{lockedName || "-"}</div>
                  <div />
                </div>

                <div className="profile-row-new">
                  <div className="label">Radiologist ID</div>
                  <div className="value">
                    <span style={{ fontWeight: 600, letterSpacing: 0.5 }}>
                      {profile?.rad_id || "Will be generated on save"}
                    </span>
                  </div>
                  <div />
                </div>

                <div className="profile-row-new">
                  <div className="label">Email</div>
                  <div className="value">{lockedEmail || "-"}</div>
                  <div />
                </div>

                <div className="profile-row-new">
                  <div className="label">Qualification</div>
                  <div className="value">
                 
                      <span style={{ fontWeight: 500 }}>MD Radiodiagnosis</span>
                 

                  </div>
                  <div />
                </div>

                <div className="profile-row-new">
                  <div className="label">Degree</div>
                  <div className="value">
                    <span className="file-name">{degreeName || "Not uploaded"}</span>
                    {profile?.degree_path && (
                      <a
                        href={`${baseUploads}${profile.degree_path}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ marginLeft: 12, fontWeight: 700 }}
                      >
                        View
                      </a>
                    )}
                  </div>
                  <div>
                    <CButton
                      className="theme-btn-sm"
                      size="sm"
                      
                      variant="outline"
                      onClick={() => openPicker("degree")}
                    >
                      Upload
                    </CButton>
                  </div>
                </div>

                <div className="profile-row-new">
                  <div className="label">Designation</div>
                  <div className="value">
                    {profile?.designation || "Consultant Radiologist"}
                  </div>

                  <div />
                </div>


                <div className="profile-row-new">
                  <div className="label">Signature</div>
                  <div className="value">
                    {signaturePreview ? (
                      <img
                        src={signaturePreview}
                        alt="signature"
                        className="signature-preview"
                        onError={() => setSignaturePreview("")}
                      />
                    ) : (
                      <span className="file-name">Not uploaded</span>
                    )}
                  </div>
                  <div>
                    <CButton
                      size="sm"
                      className="theme-btn-sm"
                      variant="outline"
                      onClick={() => openPicker("signature")}
                    >
                      Upload
                    </CButton>
                  </div>
                </div>
              </div>

              {/* Save */}
              <div className="text-center mt-4">
                <CButton color="success" onClick={handleSaveProfile}>
                  Save Profile
                </CButton>
              </div>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      {/* Upload/Crop Modal */}
      <CModal visible={uploadModalOpen} onClose={closeUploadModal} alignment="center" size="lg">
        <CModalHeader>
          <CModalTitle>
            {uploadTarget === "photo" && "Upload Profile Photo"}
            {uploadTarget === "degree" && "Upload Degree"}
            {uploadTarget === "signature" && "Upload Signature"}
          </CModalTitle>
        </CModalHeader>

        <CModalBody>
          {selectedKind === "image" && imageSrc ? (
            <>
              <div className="crop-area">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={uploadTarget === "signature" ? 3 / 1 : 1 / 1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  restrictPosition={false}
                />
              </div>

              <div className="mt-3">
                <div className="fw-semibold mb-2">Zoom</div>
                <CFormRange
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </div>

              <div className="text-body-secondary mt-2" style={{ fontSize: 12 }}>
                Crop and click Save to upload.
              </div>
            </>
          ) : (
            <>
              <div className="p-3 rounded" style={{ background: "rgba(0,0,0,0.03)" }}>
                <div className="fw-semibold">Selected file:</div>
                <div>{selectedFile?.name}</div>
                <div className="text-body-secondary" style={{ fontSize: 12 }}>
                  Click Save to upload.
                </div>
              </div>

              {selectedKind === "other" && (
                <div className="text-danger mt-3">
                  Unsupported file type. Please upload image or PDF.
                </div>
              )}
            </>
          )}
        </CModalBody>

        <CModalFooter>
          <CButton
            color="secondary"
            variant="outline"
            onClick={closeUploadModal}
            disabled={savingUpload}
          >
            Cancel
          </CButton>

          <CButton
            color="success"
            onClick={doUpload}
            disabled={savingUpload || selectedKind === "other"}
          >
            {savingUpload ? "Saving..." : "Save"}
          </CButton>
        </CModalFooter>
      </CModal>
    </>
  );
};

export default Profile;
