export const ADMIN_COPY = {
  loading: 'Loading the Open House admin page…',
  loadErrorTitle: 'Could not load this page',
  loadError:
    'We could not load the Open House admin page. Please refresh. If it is still empty, ask Nilo.',
  authCheckError:
    'We could not check if you are allowed to use Open House admin. Please refresh. If it still fails, ask Nilo.',
  todayEmptyTitle: 'No Open House event yet',
  todayEmptyBody:
    'There is nothing to show on Today because no event has been created. Guests cannot check in until you create one.',
  createEvent: 'Create event',
  todayEmptyViewer: 'Ask an Open House admin to create the first event.',
  guestEmptyNoEvent:
    'There is no guest list yet because there is no Open House event. Create an event from Today first.',
  guestEmptyNoGuests: 'Nobody has checked in to this event yet.',
  historyEmptyNoEvent: 'There is no raffle history yet because there is no Open House event.',
  historyEmptyNoDraws: 'No raffle draws have been made for this event yet.',
  openCheckInNow: 'Open check-in now',
  openCheckInNowConfirm:
    'Open check-in now? Guests can check in immediately, even before the scheduled start.',
  drawHint: 'Press DRAW or the space bar',
  editEvent: 'Edit event',
  save: 'Save',
  addStamps: 'Add stamps',
  addStampsHint: 'Tick the stations they already visited, or mark all stations done.',
  addStampsConfirmAll:
    'Add a stamp for every remaining station for this guest? They will show as Complete and can be picked in the raffle.',
  markAllStationsDone: 'Mark all stations done',
  saveTheseStamps: 'Save these stamps',
  addStampsNone: 'Tick at least one station, or mark all stations done.',
  addStampsSaved: 'Stamps saved. They will show as Complete if every station is done.',
  addStampsError: 'Could not save those stamps. Please try again. If it still fails, ask Nilo.',
} as const;

export const ADMIN_LOG = {
  events: 'Open House admin: could not load events',
  config: 'Open House admin: could not load the public event setting',
  checkins: 'Open House admin: could not load check-ins',
  stamps: 'Open House admin: could not load stamps',
  draws: 'Open House admin: could not load raffle history',
  auth: 'Open House admin: could not check admin access',
} as const;
