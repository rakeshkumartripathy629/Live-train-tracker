export interface PnrPassenger {
  number: number;
  bookingStatus: string;
  currentStatus: string;
  bookingBerth: string;
  currentBerth: string;
  bookingCoach: string;
  currentCoach: string;
  type: 'CNF' | 'RAC' | 'WL' | string;
}

export interface PnrTrain {
  number: string;
  name: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  departureTime: string;
  arrivalTime: string;
  journeyDate: string;
  bookingDate: string;
  quota: string;
  className: string;
  chartPrepared: boolean;
  chartStatus: string;
  passengerCount: number;
  coachPosition: string | null;
  expectedPlatform: string | null;
  trainStatus: string | null;
  trainCancelled: boolean;
  bookingFare: number | null;
  ticketFare: number | null;
  boardingPoint: string;
  reservationUpto: string;
}

export interface PnrStatus {
  pnr: string;
  demo?: boolean;
  train: PnrTrain;
  passengers: PnrPassenger[];
  summary: {
    confirmed: number;
    rac: number;
    waiting: number;
    probability: number;
  };
}
