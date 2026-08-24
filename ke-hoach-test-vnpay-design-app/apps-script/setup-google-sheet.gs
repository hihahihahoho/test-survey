/**
 * VNPAY Design App — Kế hoạch test Phase 1
 * Cài dropdown + màu trạng thái cho Google Sheet.
 *
 * CÁCH DÙNG
 * 1. Tạo Google Sheet, tạo 3 tab đúng tên: "Phase 1" · "Kế hoạch & Họp tuần" · "Danh mục"
 * 2. Paste từng file .tsv vào ô A1 của tab tương ứng.
 * 3. Tiện ích mở rộng → Apps Script → dán file này → Lưu → chạy hàm setupAll.
 */

var FONT = 'Arial';
var TRANG_THAI = ['Chưa cài đặt', 'Đã cài đặt', 'Đang test', 'Đã test xong', 'Đã feedback', 'Không test tuần này'];
var LOAI = ['Cũ', 'Mới'];
var DIEM = ['1', '2', '3', '4', '5'];
var TT_TUAN = ['Chưa bắt đầu', 'Đang làm', 'Hoàn thành'];

var CL = {
  navy: '#1F3864', green: '#D9EAD3', orange: '#F6B26B', note: '#FFF9E6',
  gBg: '#D9EAD3', gTx: '#38761D', rBg: '#F4CCCC', rTx: '#990000',
  yBg: '#FFF2CC', yTx: '#7F6000', bBg: '#D0E0F3', bTx: '#1C4587',
  xBg: '#EFEFEF', xTx: '#666666'
};
var ST_COLOR = {
  'Chưa cài đặt': [CL.rBg, CL.rTx], 'Đã cài đặt': [CL.xBg, CL.xTx],
  'Đang test': [CL.yBg, CL.yTx], 'Đã test xong': [CL.bBg, CL.bTx],
  'Đã feedback': [CL.gBg, CL.gTx], 'Không test tuần này': ['#FFFFFF', '#999999']
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚙ Kế hoạch test')
    .addItem('Cài đặt lại dropdown & màu', 'setupAll').addToUi();
}

function setupAll() {
  var ss = SpreadsheetApp.getActive();
  setupPhase1(ss);
  setupPlan(ss);
  setupList(ss);
  ss.toast('Đã cài xong dropdown và màu.', 'Hoàn tất', 5);
}

function sh_(ss, name) {
  var s = ss.getSheetByName(name);
  if (!s) throw new Error('Không thấy tab "' + name + '".');
  s.getRange(1, 1, s.getMaxRows(), s.getMaxColumns()).setFontFamily(FONT);
  return s;
}
function dd_(sh, a1, items) {
  sh.getRange(a1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(items, true).setAllowInvalid(true).build());
}
function rText_(range, v, bg, tx) {
  return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(v)
    .setBackground(bg).setFontColor(tx).setBold(true).setRanges([range]).build();
}

function setupPhase1(ss) {
  var sh = sh_(ss, 'Phase 1');
  var W = [55, 90, 175, 210, 275, 75, 155, 125, 125, 380];
  W.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  // dòng ghi chú
  sh.getRange(1, 1, 2, 10).mergeAcross().setBackground(CL.note).setWrap(true).setVerticalAlignment('middle');
  sh.getRange(1, 1).setFontWeight('bold');
  sh.setRowHeight(3, 8);

  // header xanh lá
  var HR = 4;
  sh.getRange(HR, 1, 1, 10).setBackground(CL.green).setFontWeight('bold').setWrap(true)
    .setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#B7B7B7', SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(HR, 40);
  sh.setFrozenRows(HR);
  sh.setFrozenColumns(2);

  // tìm hàng "TUẦN ..." để tô cam + merge
  var vals = sh.getRange(HR + 1, 1, 20, 1).getValues();
  var weekRows = [], dataRows = [];
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i][0]).trim();
    if (!v) continue;
    var r = HR + 1 + i;
    if (v.indexOf('TUẦN') === 0) weekRows.push(r); else dataRows.push(r);
  }
  weekRows.forEach(function (r) {
    sh.getRange(r, 1, 1, 10).merge().setBackground(CL.orange).setFontWeight('bold')
      .setFontSize(13).setVerticalAlignment('middle');
    sh.setRowHeight(r, 32);
  });

  var rules = [];
  // mỗi khối tuần = 4 dòng liên tiếp
  var blocks = [];
  for (var k = 0; k < dataRows.length; k += 4) blocks.push([dataRows[k], dataRows[k + 3]]);
  blocks.forEach(function (b) {
    var a1 = function (col) { return col + b[0] + ':' + col + b[1]; };
    sh.getRange(b[0], 1, 4, 10).setVerticalAlignment('middle').setFontSize(11)
      .setBorder(true, true, true, true, true, true, '#9E9E9E', SpreadsheetApp.BorderStyle.SOLID);
    for (var rr = b[0]; rr <= b[1]; rr++) sh.setRowHeight(rr, 46);
    sh.getRange(b[0], 1, 4, 2).setHorizontalAlignment('center');
    sh.getRange(b[0], 6, 4, 4).setHorizontalAlignment('center');
    sh.getRange(b[0], 5, 4, 1).setFontWeight('bold');
    [4, 5, 10].forEach(function (c) { sh.getRange(b[0], c, 4, 1).setWrap(true); });
    sh.getRange(b[1], 1, 1, 10).setBorder(null, null, true, null, null, null, '#595959', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

    dd_(sh, a1('F'), LOAI);
    dd_(sh, a1('G'), TRANG_THAI);
    dd_(sh, a1('H'), DIEM);
    dd_(sh, a1('I'), DIEM);

    Object.keys(ST_COLOR).forEach(function (v) {
      rules.push(rText_(sh.getRange(a1('G')), v, ST_COLOR[v][0], ST_COLOR[v][1]));
    });
    ['H', 'I'].forEach(function (col) {
      var rg = sh.getRange(a1(col));
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThanOrEqualTo(2)
        .setBackground(CL.rBg).setFontColor(CL.rTx).setBold(true).setRanges([rg]).build());
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberEqualTo(3)
        .setBackground(CL.yBg).setFontColor(CL.yTx).setBold(true).setRanges([rg]).build());
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(4)
        .setBackground(CL.gBg).setFontColor(CL.gTx).setBold(true).setRanges([rg]).build());
    });
    rules.push(rText_(sh.getRange(a1('D')), '⚠ Chưa cấp', CL.rBg, CL.rTx));
  });
  sh.setConditionalFormatRules(rules);
}

function setupPlan(ss) {
  var sh = sh_(ss, 'Kế hoạch & Họp tuần');
  var W = [120, 165, 350, 210, 420, 140];
  W.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.getRange(1, 1, 1, 6).merge().setBackground(CL.navy).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(12).setVerticalAlignment('middle');
  sh.getRange(3, 1, 1, 6).setBackground(CL.green).setFontWeight('bold').setWrap(true)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeights(4, 4, 62);
  sh.getRange(4, 1, 4, 6).setWrap(true).setVerticalAlignment('middle').setFontSize(11)
    .setBorder(true, true, true, true, true, true, '#B7B7B7', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(4, 1, 4, 1).setFontWeight('bold');
  sh.getRange(7, 1, 1, 6).setBackground(CL.note);   // dòng Phase 2 (ghi chú tạm)
  sh.setFrozenRows(3);
  dd_(sh, 'F4:F7', TT_TUAN);
  var rg = sh.getRange('F4:F7');
  sh.setConditionalFormatRules([
    rText_(rg, 'Chưa bắt đầu', CL.xBg, CL.xTx),
    rText_(rg, 'Đang làm', CL.yBg, CL.yTx),
    rText_(rg, 'Hoàn thành', CL.gBg, CL.gTx)
  ]);
}

function setupList(ss) {
  var sh = sh_(ss, 'Danh mục');
  sh.getRange(1, 1, 1, 4).setBackground(CL.navy).setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  for (var i = 1; i <= 4; i++) sh.setColumnWidth(i, 170);
  sh.setFrozenRows(1);
}
