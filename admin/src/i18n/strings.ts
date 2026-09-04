/**
 * Every word the admin console says, in both languages.
 *
 * Marathi is the default here as it is in the seller app - the people running
 * this programme work in Marathi, and an English-only console would quietly
 * decide who is allowed to administer it. The toggle is one click.
 *
 * DATA IS NEVER TRANSLATED. A seller's name, her village, her product title
 * are rendered exactly as stored. Only the console's own chrome lives here.
 *
 * Both dictionaries must hold identical keys - tests/i18n.test.ts fails the
 * build otherwise, so a missing Marathi string cannot reach staff.
 */

export const LANGS = [
  { code: 'mr', label: 'मराठी', sub: 'Marathi' },
  { code: 'en', label: 'English', sub: 'इंग्रजी' },
] as const

export type LangCode = (typeof LANGS)[number]['code']

const mr: Record<string, string> = {
  /* ---- chrome ---------------------------------------------------- */
  'app.name': 'शांता महिला बाजार',
  'app.admin': 'प्रशासन',
  'app.signOut': 'बाहेर पडा',
  'app.language': 'भाषा',

  /* ---- navigation ------------------------------------------------ */
  'nav.today': 'आज',
  'nav.payments': 'पैसे भरणा',
  'nav.products': 'उत्पादने',
  'nav.sellers': 'विक्रेत्या',
  'nav.orders': 'ऑर्डर',
  'nav.impact': 'परिणाम',

  /* ---- common ---------------------------------------------------- */
  'c.loading': 'थांबा...',
  'c.retry': 'पुन्हा प्रयत्न करा',
  'c.cancel': 'रद्द करा',
  'c.confirm': 'नक्की',
  'c.save': 'जतन करा',
  'c.search': 'शोधा',
  'c.all': 'सर्व',
  'c.none': 'काहीही नाही',
  'c.of': 'पैकी',
  'c.hoursShort': 'तास',
  'c.daysShort': 'दिवस',
  'c.by': 'यांनी',
  'c.reason': 'कारण',
  'c.required': 'आवश्यक',
  'c.networkError': 'सर्व्हरशी संपर्क होत नाही. पुन्हा प्रयत्न करा.',
  'c.unknownError': 'काहीतरी चूक झाली.',

  /* ---- sign in --------------------------------------------------- */
  'in.title': 'प्रशासन प्रवेश',
  'in.sub': 'फक्त कार्यक्रम कर्मचाऱ्यांसाठी',
  'in.email': 'ईमेल',
  'in.password': 'पासवर्ड',
  'in.submit': 'प्रवेश करा',
  'in.working': 'तपासत आहे...',
  'in.failed': 'ईमेल किंवा पासवर्ड चुकीचा आहे',

  /* ---- today ----------------------------------------------------- */
  'today.title': 'आज',
  'today.needsYou': 'तुमची गरज आहे',
  'today.allClear': 'सर्व काम पूर्ण झाले',
  'today.allClearSub': 'सध्या मंजुरीसाठी काहीही प्रलंबित नाही.',
  'today.pendingPayments': 'पैसे भरणा प्रलंबित',
  'today.pendingProducts': 'उत्पादने तपासायची',
  'today.stuckOrders': 'अडकलेल्या ऑर्डर',
  'today.activeSellers': 'सक्रिय विक्रेत्या',
  'today.totalSellers': 'एकूण विक्रेत्या',
  'today.newThisWeek': 'या आठवड्यात नवीन',
  'today.ordersToday': 'आजच्या ऑर्डर',
  'today.ordersWeek': 'या आठवड्यातील ऑर्डर',
  'today.earnedMonth': 'या महिन्यात कमाई',
  'today.earnedTotal': 'एकूण कमाई',
  'today.firstEarning': 'पहिली कमाई झालेल्या',
  'today.health': 'एकूण स्थिती',
  'today.funnel': 'नोंदणी ते पहिली ऑर्डर',
  'today.oldestWaiting': 'सर्वात जुनी प्रतीक्षा',

  /* ---- payments -------------------------------------------------- */
  'pay.title': 'पैसे भरणा',
  'pay.pending': 'प्रलंबित',
  'pay.approved': 'मंजूर',
  'pay.rejected': 'नाकारले',
  'pay.utr': 'UTR क्रमांक',
  'pay.submitted': 'भरल्याची वेळ',
  'pay.waiting': 'प्रतीक्षा',
  'pay.approve': 'मंजूर करा',
  'pay.reject': 'नाकारा',
  'pay.approveNote': 'मंजूर केल्यावर तिला 5 जागा मिळतील आणि ती विक्री सुरू करू शकेल.',
  'pay.rejectReason': 'नाकारण्याचे कारण',
  'pay.rejectReasonHint': 'हे तिला दिसेल. तिला समजेल असे लिहा.',
  'pay.rejectConfirm': 'नाकारा',
  'pay.empty': 'प्रलंबित भरणा नाही',
  'pay.emptySub': 'नवीन भरणा आल्यावर इथे दिसेल.',
  'pay.verifiedBy': 'तपासले',

  /* ---- products -------------------------------------------------- */
  'pr.title': 'उत्पादने',
  'pr.pendingTab': 'तपासायची',
  'pr.liveTab': 'प्रकाशित',
  'pr.rejectedTab': 'नाकारलेली',
  'pr.publish': 'प्रकाशित करा',
  'pr.reject': 'नाकारा',
  'pr.rejectReason': 'नाकारण्याचे कारण',
  'pr.rejectReasonHint': 'तिला काय दुरुस्त करायचे ते सांगा.',
  'pr.food': 'खाद्यपदार्थ',
  'pr.fssaiMissing': 'FSSAI क्रमांकाशिवाय खाद्यपदार्थ प्रकाशित करता येणार नाही',
  'pr.fssai': 'FSSAI',
  'pr.empty': 'तपासण्यासाठी उत्पादन नाही',
  'pr.emptySub': 'विक्रेत्यांनी नवीन उत्पादन टाकल्यावर इथे दिसेल.',
  'pr.by': 'विक्रेती',

  /* ---- sellers --------------------------------------------------- */
  'se.title': 'विक्रेत्या',
  'se.searchHint': 'नाव, गाव किंवा फोन',
  'se.status': 'स्थिती',
  'se.slots': 'जागा',
  'se.village': 'गाव',
  'se.phone': 'फोन',
  'se.readiness': 'डिजिटल तयारी',
  'se.grantSlots': 'जागा द्या',
  'se.grantSlotsHint': 'सद्भावना, प्रशिक्षण गट किंवा डेमो खात्यासाठी.',
  'se.block': 'बंद करा',
  'se.unblock': 'पुन्हा सुरू करा',
  'se.blockConfirm': 'ही विक्रेती बंद करायची? तिची उत्पादने ग्राहकांना दिसणार नाहीत.',
  'se.empty': 'अजून कोणी नोंदणी केलेली नाही',
  'se.emptySub': 'पहिली विक्रेती नोंदणी केल्यावर इथे दिसेल.',
  'se.products': 'उत्पादने',

  /* ---- seller statuses ------------------------------------------- */
  'st.REGISTERED': 'नोंदणी झाली',
  'st.PAYMENT_SUBMITTED': 'भरणा तपासायचा',
  'st.ACTIVE': 'सक्रिय',
  'st.PAYMENT_REJECTED': 'भरणा नाकारला',
  'st.BLOCKED': 'बंद',

  /* ---- orders ---------------------------------------------------- */
  'or.title': 'ऑर्डर',
  'or.stuck': 'अडकलेली',
  'or.customerHidden': 'ग्राहक',
  'or.customerHiddenNote': 'ग्राहकाचे नाव, फोन आणि पत्ता ऑर्डर उघडल्यावरच दिसतो.',
  'or.seller': 'विक्रेती',
  'or.placed': 'ऑर्डर वेळ',
  'or.total': 'रक्कम',
  'or.pincode': 'पिनकोड',
  'or.filterStatus': 'स्थिती',
  'or.filterPincode': 'पिनकोड',
  'or.open': 'उघडा',
  'or.readOnly': 'ऑर्डर पुढे नेणे विक्रेतीचे काम आहे. इथून फक्त पाहता येते.',
  'or.customer': 'ग्राहक',
  'or.address': 'पत्ता',
  'or.items': 'वस्तू',
  'or.empty': 'ऑर्डर नाहीत',
  'or.emptySub': 'पहिली ऑर्डर आल्यावर इथे दिसेल.',
  'or.lastEvent': 'शेवटची हालचाल',

  /* ---- impact ---------------------------------------------------- */
  'im.title': 'परिणाम',
  'im.sub': 'देणगीदार आणि CSR अहवालासाठी आकडे.',
  'im.women': 'नोंदणी झालेल्या महिला',
  'im.activeWomen': 'सक्रिय महिला',
  'im.womenEarning': 'कमाई झालेल्या महिला',
  'im.earned': 'एकूण कमाई',
  'im.orders': 'पूर्ण झालेल्या ऑर्डर',
  'im.villages': 'गावे',
  'im.byVillage': 'गावानुसार',
  'im.copy': 'अहवालासाठी कॉपी करा',
  'im.copied': 'कॉपी झाले',
  'im.generatedAt': 'तयार केल्याची वेळ',
  'im.readiness': 'डिजिटल तयारी',

  /* ---- server errors, mirrored from the API ---------------------- */
  'err.paymentNotFound': 'हा भरणा सापडला नाही',
  'err.sellerNotFound': 'ही विक्रेती सापडली नाही',
  'err.productNotFound': 'हे उत्पादन सापडले नाही',
  'err.alreadySettled': 'यावर आधीच निर्णय झाला आहे',
  'err.notAllowed': 'तुम्हाला परवानगी नाही',
  'err.signedOut': 'पुन्हा प्रवेश करा',
}

const en: Record<string, string> = {
  /* ---- chrome ---------------------------------------------------- */
  'app.name': 'Shanta Mahila Bazar',
  'app.admin': 'Admin',
  'app.signOut': 'Sign out',
  'app.language': 'Language',

  /* ---- navigation ------------------------------------------------ */
  'nav.today': 'Today',
  'nav.payments': 'Payments',
  'nav.products': 'Products',
  'nav.sellers': 'Sellers',
  'nav.orders': 'Orders',
  'nav.impact': 'Impact',

  /* ---- common ---------------------------------------------------- */
  'c.loading': 'Loading...',
  'c.retry': 'Try again',
  'c.cancel': 'Cancel',
  'c.confirm': 'Confirm',
  'c.save': 'Save',
  'c.search': 'Search',
  'c.all': 'All',
  'c.none': 'None',
  'c.of': 'of',
  'c.hoursShort': 'h',
  'c.daysShort': 'd',
  'c.by': 'by',
  'c.reason': 'Reason',
  'c.required': 'required',
  'c.networkError': 'Cannot reach the server. Try again.',
  'c.unknownError': 'Something went wrong.',

  /* ---- sign in --------------------------------------------------- */
  'in.title': 'Admin sign in',
  'in.sub': 'Programme staff only',
  'in.email': 'Email',
  'in.password': 'Password',
  'in.submit': 'Sign in',
  'in.working': 'Checking...',
  'in.failed': 'Email or password is wrong',

  /* ---- today ----------------------------------------------------- */
  'today.title': 'Today',
  'today.needsYou': 'Needs you now',
  'today.allClear': 'Nothing waiting',
  'today.allClearSub': 'No approvals are pending right now.',
  'today.pendingPayments': 'Payments waiting',
  'today.pendingProducts': 'Products to review',
  'today.stuckOrders': 'Orders stuck',
  'today.activeSellers': 'Active sellers',
  'today.totalSellers': 'Total sellers',
  'today.newThisWeek': 'New this week',
  'today.ordersToday': 'Orders today',
  'today.ordersWeek': 'Orders this week',
  'today.earnedMonth': 'Earned this month',
  'today.earnedTotal': 'Earned in total',
  'today.firstEarning': 'Women who have earned',
  'today.health': 'Overall',
  'today.funnel': 'Registered to first order',
  'today.oldestWaiting': 'Waiting longest',

  /* ---- payments -------------------------------------------------- */
  'pay.title': 'Payments',
  'pay.pending': 'Pending',
  'pay.approved': 'Approved',
  'pay.rejected': 'Rejected',
  'pay.utr': 'UTR reference',
  'pay.submitted': 'Submitted',
  'pay.waiting': 'Waiting',
  'pay.approve': 'Approve',
  'pay.reject': 'Reject',
  'pay.approveNote': 'Approving gives her 5 slots and lets her start selling.',
  'pay.rejectReason': 'Reason for rejection',
  'pay.rejectReasonHint': 'She reads this. Write it for her, not for the file.',
  'pay.rejectConfirm': 'Reject',
  'pay.empty': 'No payments waiting',
  'pay.emptySub': 'New payments will appear here.',
  'pay.verifiedBy': 'Checked',

  /* ---- products -------------------------------------------------- */
  'pr.title': 'Products',
  'pr.pendingTab': 'To review',
  'pr.liveTab': 'Published',
  'pr.rejectedTab': 'Rejected',
  'pr.publish': 'Publish',
  'pr.reject': 'Reject',
  'pr.rejectReason': 'Reason for rejection',
  'pr.rejectReasonHint': 'Tell her what to fix.',
  'pr.food': 'Food',
  'pr.fssaiMissing': 'A food listing cannot be published without an FSSAI number',
  'pr.fssai': 'FSSAI',
  'pr.empty': 'Nothing to review',
  'pr.emptySub': 'New listings will appear here.',
  'pr.by': 'Seller',

  /* ---- sellers --------------------------------------------------- */
  'se.title': 'Sellers',
  'se.searchHint': 'Name, village or phone',
  'se.status': 'Status',
  'se.slots': 'Slots',
  'se.village': 'Village',
  'se.phone': 'Phone',
  'se.readiness': 'Digital readiness',
  'se.grantSlots': 'Grant slots',
  'se.grantSlotsHint': 'Goodwill, a training batch, or a demo account.',
  'se.block': 'Block',
  'se.unblock': 'Unblock',
  'se.blockConfirm': 'Block this seller? Her products stop showing to customers.',
  'se.empty': 'No sellers yet',
  'se.emptySub': 'The first registration will appear here.',
  'se.products': 'Products',

  /* ---- seller statuses ------------------------------------------- */
  'st.REGISTERED': 'Registered',
  'st.PAYMENT_SUBMITTED': 'Payment to check',
  'st.ACTIVE': 'Active',
  'st.PAYMENT_REJECTED': 'Payment rejected',
  'st.BLOCKED': 'Blocked',

  /* ---- orders ---------------------------------------------------- */
  'or.title': 'Orders',
  'or.stuck': 'Stuck',
  'or.customerHidden': 'Customer',
  'or.customerHiddenNote': 'The buyer’s name, phone and address show only inside an order.',
  'or.seller': 'Seller',
  'or.placed': 'Placed',
  'or.total': 'Total',
  'or.pincode': 'Pincode',
  'or.filterStatus': 'Status',
  'or.filterPincode': 'Pincode',
  'or.open': 'Open',
  'or.readOnly': 'Moving an order along is the seller’s job. This is read-only.',
  'or.customer': 'Customer',
  'or.address': 'Address',
  'or.items': 'Items',
  'or.empty': 'No orders',
  'or.emptySub': 'The first order will appear here.',
  'or.lastEvent': 'Last movement',

  /* ---- impact ---------------------------------------------------- */
  'im.title': 'Impact',
  'im.sub': 'The figures a funder or CSR report asks for.',
  'im.women': 'Women registered',
  'im.activeWomen': 'Active women',
  'im.womenEarning': 'Women who have earned',
  'im.earned': 'Total earned',
  'im.orders': 'Orders delivered',
  'im.villages': 'Villages',
  'im.byVillage': 'By village',
  'im.copy': 'Copy for report',
  'im.copied': 'Copied',
  'im.generatedAt': 'Generated',
  'im.readiness': 'Digital readiness',

  /* ---- server errors, mirrored from the API ---------------------- */
  'err.paymentNotFound': 'That payment was not found',
  'err.sellerNotFound': 'That seller was not found',
  'err.productNotFound': 'That product was not found',
  'err.alreadySettled': 'This has already been decided',
  'err.notAllowed': 'You do not have permission',
  'err.signedOut': 'Please sign in again',
}

export const dictionaries: Record<LangCode, Record<string, string>> = { mr, en }
