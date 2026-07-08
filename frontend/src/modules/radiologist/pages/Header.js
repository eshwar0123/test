import React, { useEffect, useState, useRef } from "react";
import {
  CHeader,
  CContainer,
  CDropdown,
  CDropdownToggle,
  CDropdownMenu,
  CDropdownItem,
  CButton,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilUser, cilAccountLogout, cilBell, cilSpeedometer, cilFolder, cilSettings } from "@coreui/icons";
import { useNavigate, NavLink } from "react-router-dom";
import GoogleTranslateSwitcher from "../../../shared/components/GoogleTranslateSwitcher";

const DUMMY_NOTIFICATIONS = [
  { id: 1, type: "stat",    title: "STAT Case Assigned",         desc: "CASE-20260326-1001 — Head CT assigned to you",                  time: "2 min ago",  unread: true },
  { id: 2, type: "report",  title: "Report Approved",            desc: "CASE-20260325-0987 — Chest X-Ray report signed off by Dr. Rao", time: "18 min ago", unread: true },
  { id: 3, type: "urgent",  title: "Urgent Addendum Requested",  desc: "CASE-20260325-0954 — MRI Brain: clinician requests addendum",   time: "45 min ago", unread: true },
  { id: 4, type: "system",  title: "System Maintenance",         desc: "Scheduled downtime tonight 02:00–03:00 IST",                    time: "1 hr ago",   unread: false },
  { id: 5, type: "report",  title: "Report Rejected",            desc: "CASE-20260325-0912 — CT Abdomen report returned for revision",  time: "2 hr ago",   unread: false },
];

const Header = ({ darkMode, toggleDarkMode, onViewerExit }) => {
  const navigate = useNavigate();

  // When onViewerExit is provided (viewer route), trigger the two-step exit:
  // unmount DicomViewer first, then navigate — bypasses Cornerstone render loops.
  const navTo = (path) => {
    if (onViewerExit) onViewerExit(path);
    else navigate(path);
  };

  const auth = JSON.parse(localStorage.getItem("auth"));
  const isLoggedIn = auth?.isLoggedIn;

  const userName = auth ? `${auth.firstName} ${auth.lastName}` : "";
  const initials = userName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const [avatarUrl, setAvatarUrl] = useState(localStorage.getItem("avatarUrl") || "");
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState(DUMMY_NOTIFICATIONS);
  const notifRef = useRef(null);

  const unreadCount = notifications.filter(n => n.unread).length;
  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, unread: false })));

  useEffect(() => {
    const handler = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const refresh = () => setAvatarUrl(localStorage.getItem("avatarUrl") || "");
    window.addEventListener("avatar-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("avatar-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("auth");
    localStorage.removeItem("avatarUrl");
    navigate("/login");
  };

  const logoSrc = darkMode ? "/logo1.png" : "/logo.png";

  return (
    <CHeader className="header">
      <CContainer fluid className="header-inner">

        {/* LEFT — Logo + Nav (NO Settings here) */}
        <div className="header-left">
          <div className="header-logo-wrap" onClick={() => navTo("/radiologist/repository1")} title="ONIX AI">
            <img src={logoSrc} alt="ONIX AI" className="header-logo-img"
              onError={(e) => { e.currentTarget.style.display = "none"; }} />
          </div>

          <nav className="header-nav">
            <NavLink
              to="/radiologist/dashboard"
              className={({ isActive }) => `header-nav-link ${isActive ? "active" : ""}`}
              onClick={onViewerExit ? (e) => { e.preventDefault(); navTo("/radiologist/dashboard"); } : undefined}
            >
              <CIcon icon={cilSpeedometer} size="sm" /> Dashboard
            </NavLink>
            <NavLink
              to="/radiologist/repository1"
              className={({ isActive }) => `header-nav-link ${isActive ? "active" : ""}`}
              onClick={onViewerExit ? (e) => { e.preventDefault(); navTo("/radiologist/repository1"); } : undefined}
            >
              <CIcon icon={cilFolder} size="sm" /> Repository
            </NavLink>
            {/* ✅ Settings removed from nav — moved to avatar dropdown */}
          </nav>
        </div>

        {/* RIGHT */}
        <div className="header-right">

          {/* Dark mode toggle */}
          <button
            className="dm-toggle"
            onClick={toggleDarkMode}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? "☀" : "☾"}
          </button>

          <GoogleTranslateSwitcher />

          {/* Notification bell */}
          <div className="notif-wrapper" ref={notifRef}>
            <button
              className="notif-bell"
              onClick={() => setNotifOpen(prev => !prev)}
              title="Notifications"
            >
              <CIcon icon={cilBell} size="lg" />
              {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
            </button>

            {notifOpen && (
              <div className="notif-dropdown">
                <div className="notif-dropdown-header">
                  <span className="notif-dropdown-title">Notifications</span>
                  {unreadCount > 0 && (
                    <button className="notif-mark-read" onClick={markAllRead}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="notif-dropdown-list">
                  {notifications.map(n => (
                    <div key={n.id} className={`notif-item ${n.unread ? "unread" : ""}`}>
                      <div className={`notif-dot ${n.type}`} />
                      <div className="notif-content">
                        <div className="notif-item-title">{n.title}</div>
                        <div className="notif-item-desc">{n.desc}</div>
                        <div className="notif-item-time">{n.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {isLoggedIn ? (
            <CDropdown alignment="end">
              <CDropdownToggle className="profile-toggle green-profile-toggle">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="avatar"
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      objectFit: "cover",
                      display: "block",
                    }}
                    onError={() => {
                      localStorage.removeItem("avatarUrl");
                      setAvatarUrl("");
                    }}
                  />
                ) : (
                  <span>{initials || "U"}</span>
                )}
              </CDropdownToggle>

              <CDropdownMenu>
                {/* ✅ Profile */}
                <CDropdownItem
                  className="profile-dropdown-item"
                  onClick={() => navigate("/radiologist/profile")}
                >
                  <CIcon icon={cilUser} className="me-2" />
                  Profile
                </CDropdownItem>

                {/* ✅ Settings — moved here from nav */}
                <CDropdownItem
                  className="profile-dropdown-item"
                  onClick={() => navigate("/radiologist/settings")}
                >
                  <CIcon icon={cilSettings} className="me-2" />
                  Settings
                </CDropdownItem>

                {/* ✅ Logout */}
                <CDropdownItem
                  className="profile-dropdown-item"
                  onClick={handleLogout}
                >
                  <CIcon icon={cilAccountLogout} className="me-2" />
                  Logout
                </CDropdownItem>
              </CDropdownMenu>
            </CDropdown>
          ) : (
            <CButton className="header-login-btn" onClick={() => navigate("/login")}>
              Login
            </CButton>
          )}
        </div>

      </CContainer>
    </CHeader>
  );
};

export default Header;
