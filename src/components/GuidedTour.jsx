import React, { useState, useEffect } from 'react';
import { Joyride, STATUS } from 'react-joyride';
import { updateTourStatus } from '../services/authService';
import { getCurrentUser } from '../services/rbac';
import { logger } from '../utils/logger';

const TOUR_VERSION = '1.0';

const GuidedTour = () => {
  const [run, setRun] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);

    // Visibility logic based on role and environment
    const checkVisibility = () => {
      if (!currentUser) return false;
      
      const role = (currentUser.role || '').toLowerCase();
      const isProd = import.meta.env.PROD;
      const showForAdmins = import.meta.env.VITE_SHOW_GUIDES_FOR_ADMINS === 'true';
      
      // Hide for superadmin or developer unless in non-prod and forced enabled
      if (role === 'superadmin' || role === 'developer') {
        return !isProd && showForAdmins;
      }
      
      // Show for others (regular admin, user) if tour not completed
      return !currentUser.tour_completed;
    };

    // Run tour if visibility check passes
    if (checkVisibility()) {
      // Delay a bit to ensure UI is ready
      const timer = setTimeout(() => {
        setRun(true);
        logger.info("[TOUR]", "Starting guided tour for user:", currentUser.username);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const steps = [
    {
      target: 'body',
      placement: 'center',
      title: 'Selamat Datang!',
      content: 'Selamat datang di MWL PACS UI. Mari kita jelajahi fitur-fitur utamanya.',
      disableBeacon: true,
    },
    {
      target: '.sidebar-nav',
      title: 'Navigasi Utama',
      content: 'Gunakan sidebar ini untuk berpindah antar menu utama aplikasi.',
      placement: 'right',
      spotlightPadding: 10,
    },
    {
      target: '.search-container',
      title: 'Pencarian Cepat',
      content: 'Gunakan fitur pencarian untuk menemukan data pasien atau order dengan cepat.',
      placement: 'bottom',
      spotlightPadding: 5,
    },
    {
      target: '.topbar-user',
      title: 'Profil Pengguna',
      content: 'Di sini Anda dapat melihat profil Anda, mengubah pengaturan, atau keluar dari aplikasi.',
      placement: 'left',
      spotlightPadding: 5,
    },
    {
      target: 'body',
      placement: 'center',
      title: 'Selesai!',
      content: 'Tur selesai. Anda sekarang siap menggunakan aplikasi ini. Jika butuh bantuan, hubungi administrator.',
    }
  ];

  const handleJoyrideCallback = async (data) => {
    const { status, type } = data;
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      try {
        await updateTourStatus(TOUR_VERSION);
        logger.info("[TOUR]", "Tour completed/skipped and saved to profile");
      } catch (err) {
        logger.error("[TOUR]", "Failed to save tour status:", err.message);
      }
    }
  };

  if (!user || !run) return null;

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous
      hideCloseButton
      run={run}
      scrollToFirstStep
      showProgress
      showSkipButton
      steps={steps}
      disableScrolling={false}
      scrollOffset={100}
      styles={{
        options: {
          zIndex: 100000, // Increase z-index significantly
          primaryColor: '#3b82f6', // Tailwind blue-500
          backgroundColor: '#ffffff',
          textColor: '#1f2937', // Tailwind gray-800
          arrowColor: '#ffffff',
        },
        tooltip: {
          borderRadius: '8px',
          padding: '15px',
        },
        buttonNext: {
          padding: '8px 16px',
          fontSize: '14px',
        },
        buttonBack: {
          marginRight: '10px',
          fontSize: '14px',
        },
        spotlight: {
          borderRadius: '8px',
        }
      }}
      locale={{
        back: 'Kembali',
        close: 'Tutup',
        last: 'Selesai',
        next: 'Lanjut',
        skip: 'Lewati',
      }}
    />
  );
};

export default GuidedTour;
