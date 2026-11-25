import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-749 (cu-researcher's sweep 5): the system localises an NSAlert's or a browser dialog's own buttons while the app's text stays
// English, so a dialog's affirmative in any other system language reads the dialog exactly as English 'OK' does; a dialog whose text
// gets no class stays free, and a back-out button stays free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (v) => (v.decision === 'allow' ? [] : [...(v.classes ?? [v.class])].sort())
const press = (name, dialogName, url = 'https://app.example/settings') =>
  classesOf(policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url, target: { tag: 'button', role: 'button', name, ...(dialogName === undefined ? {} : { dialogName }) } }))
const desk = (name, dialogName, bundle = 'com.apple.Notes') =>
  classesOf(policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: `desktop://${bundle}`, frontmostBundleId: bundle, target: { role: 'AXButton', name, dialogName, inWebArea: false } }))

test('CU-749: the filed rows, verbatim - each asks the class its English title asks with OK', () => {
  const web = [['نعم', 'Delete this repository?', 'delete'], ['موافق', 'Delete 3 files?', 'delete'], ['כן', 'Delete account permanently?', 'delete'],
    ['אישור', 'Buy 1,000 coins for $9.99?', 'purchase'], ['Tak', 'Delete this project?', 'delete']]
  for (const [name, dialogName, cls] of web) {
    assert.ok(press(name, dialogName).includes(cls), `web ${name} / ${dialogName}: ${press(name, dialogName)}`)
    assert.deepEqual(press(name, dialogName), press('OK', dialogName), `web ${name} reads like OK`)
  }
  const desktop = [['تأكيد', 'Transfer ownership to Sam?', 'permission'], ['Evet', 'Delete this note?', 'delete']]
  for (const [name, dialogName, cls] of desktop) {
    assert.ok(desk(name, dialogName).includes(cls), `desktop ${name} / ${dialogName}: ${desk(name, dialogName)}`)
    assert.deepEqual(desk(name, dialogName), desk('OK', dialogName), `desktop ${name} reads like OK`)
  }
})

test('CU-749: the filed free rows stay free', () => {
  assert.deepEqual(press('نعم', 'Save changes?'), [], "'Save changes?' + نعم")
  assert.deepEqual(press('כן', 'Open the file?'), [], "'Open the file?' + כן")
})

test('CU-749: the class - the affirmative, OK, confirm and continue words of the other system languages, on both routes', () => {
  const words = [
    'حسنًا', 'تأكيد', 'متابعة', 'قبول', 'بله', 'تأیید', 'باشه', 'ادامه', 'جی ہاں', 'ٹھیک ہے', 'אוקיי', 'המשך', 'אני מסכים',
    'Potwierdź', 'Kontynuuj', 'Dalej', 'Bekräfta', 'Fortsätt', 'Bekræft', 'Fortsæt', 'Bekreft', 'Fortsett', 'Kyllä', 'Vahvista', 'Jatka',
    'Ano', 'Potvrdit', 'Pokračovat', 'Áno', 'Pokračovať', 'Igen', 'Rendben', 'Tovább', 'Da', 'Confirmă', 'Continuă', 'U redu', 'Potvrdi',
    'V redu', 'Taip', 'Gerai', 'Jā', 'Labi', 'Jah', 'Kinnita', "D'acord", 'Так', 'Гаразд', 'Підтвердити', 'Продовжити', 'Добре', 'Потвърди',
    'Ναι', 'Εντάξει', 'Επιβεβαίωση', 'Có', 'Đồng ý', 'Xác nhận', 'Tiếp tục', 'ใช่', 'ตกลง', 'ยืนยัน', 'Ya', 'Oke', 'Lanjutkan', 'Setuju',
    'हाँ', 'ठीक है', 'पुष्टि करें', 'হ্যাঁ', 'ঠিক আছে', 'Иә', 'Жарайды', 'Já', 'Այո', 'დიახ', 'Ndiyo', 'Sige', 'Onaylıyorum',
  ]
  for (const dialogName of ['Delete this repository?', 'Buy 1,000 coins for $9.99?']) {
    const ok = press('OK', dialogName)
    assert.ok(ok.length > 0, `English OK asks under ${dialogName}`)
    for (const word of words) assert.deepEqual(press(word, dialogName), ok, `web ${word} / ${dialogName}`)
  }
  const deskOk = desk('OK', 'Delete this note?')
  assert.ok(deskOk.length > 0)
  for (const word of ['نعم', 'כן', 'אישור', 'Tak', 'Bekräfta', 'Kyllä', 'Ano', 'Igen', 'Ναι', 'Có', 'ตกลง', 'हाँ', 'بله']) assert.deepEqual(desk(word, 'Delete this note?'), deskOk, `desktop ${word}`)
})

test('CU-749: the same words written with marks, bidi controls, caps or without accents, and two joined by a comma', () => {
  const dialogName = 'Delete this repository?'
  const ok = press('OK', dialogName)
  for (const word of ['\u200fنعم', 'نَعَم', 'نعـم', 'כֵּן', '\u202bאישור\u202c', 'ΕΝΤΑΞΕΙ', 'ΝΑΙ', 'Potwierdz', 'Bekrafta', 'İleri', 'TAK', 'TAK!', 'نعم، متابعة', 'Tak, kontynuuj', 'Ναι, συνέχεια'])
    assert.deepEqual(press(word, dialogName), ok, `web ${JSON.stringify(word)}`)
})

test('CU-749 near collisions: back-out buttons stay free in the same dialogs', () => {
  const backouts = ['إلغاء', 'لا', 'ليس الآن', 'لغو', 'خیر', 'ביטול', 'לא', 'Anuluj', 'Nie', 'Avbryt', 'Nej', 'Annuller', 'Peruuta', 'Ei', 'Zrušit', 'Ne', 'Zrušiť',
    'Mégse', 'Nem', 'Anulează', 'Nu', 'Odustani', 'Prekliči', 'Atšaukti', 'Atcelt', 'Tühista', 'Скасувати', 'Ні', 'Отказ', 'Не', 'Άκυρο', 'Όχι', 'Hủy', 'Không',
    'ยกเลิก', 'ไม่', 'Batal', 'Tidak', 'Hayır', 'İptal', 'रद्द करें', 'नहीं', 'বাতিল', 'না', 'Hapana', 'Ghairi', 'Hindi']
  for (const dialogName of ['Delete this repository?', 'Buy 1,000 coins for $9.99?']) {
    for (const word of backouts) assert.deepEqual(press(word, dialogName), [], `web ${word} / ${dialogName}`)
  }
  for (const word of ['إلغاء', 'ביטול', 'Anuluj', 'Avbryt', 'Hayır', 'Άκυρο']) assert.deepEqual(desk(word, 'Delete this note?'), [], `desktop ${word}`)
})

test('CU-749 near collisions: the affirmatives in harmless dialogs, outside any dialog, and as words inside longer names stay free', () => {
  for (const [word, dialogName] of [['نعم', 'Show the details?'], ['כן', 'Tip of the day'], ['Tak', 'Open the file?'], ['Kyllä', 'Save changes?'], ['ตกลง', 'Welcome back'], ['Có', 'Show hidden files?']]) {
    assert.deepEqual(press(word, dialogName), [], `${word} / ${dialogName}`)
    assert.deepEqual(press('OK', dialogName), [], `OK / ${dialogName} (parity)`)
  }
  for (const word of ['نعم', 'כן', 'אישור', 'Tak', 'Bekräfta', 'Kyllä', 'ตกลง', 'हाँ']) assert.deepEqual(press(word), [], `${word} outside a dialog`)
  for (const word of ['Tak, ale później', 'Terima kasih', 'Da capo', 'Ya know', 'كن على اطلاع']) assert.deepEqual(press(word, 'Delete this repository?'), press('Learn more', 'Delete this repository?'), `${word} is no bare affirmative`)
})
