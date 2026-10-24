import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppointmentBookingWizard } from '../components/appointment-booking-wizard';

export const BookingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialDate = searchParams.get('date') || undefined;
  const initialRoomId = searchParams.get('roomId') || undefined;
  const initialTherapistId = searchParams.get('therapistId') || undefined;

  const handleClose = () => {
    navigate('/scheduling');
  };

  return (
    <div className="flex flex-col flex-1 min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-4xl mx-auto w-full">
      <AppointmentBookingWizard
        isOpen={true}
        onClose={handleClose}
        initialDate={initialDate}
        initialRoomId={initialRoomId}
        initialTherapistId={initialTherapistId}
      />
    </div>
  );
};
