import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-684 (strict English parity; the English facts are on the issue): leaving a workspace / organization / team / server asks permission
// in the locales as 'Leave workspace' does; 'project', negation, past / status, the bare verb and other objects do not take permission.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/team', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-684: locale leave-workspace rows ask permission as their English twins (parity)', () => {
  for (const name of ['Quitter l’espace de travail', 'Quitter l’organisation', "Quitter l'équipe", 'Quitter le serveur', 'Quitter cette organisation', 'Quitter l’organisation maintenant',
 'Salir del espacio de trabajo', 'Abandonar la organización', 'Salir del equipo', 'Abandonar el servidor', 'Sair do espaço de trabalho', 'Sair da organização', 'Deixar a equipe',
 'Lascia lo spazio di lavoro', "Abbandona l'organizzazione", 'Esci dal team', 'Arbeitsbereich verlassen', 'Organisation verlassen', 'Team verlassen', 'Den Server verlassen', 'Verlassen Sie die Organisation', 'Organisation jetzt verlassen',
 'Werkruimte verlaten', 'Organisatie verlaten', 'Verlaat het team', 'Покинуть рабочее пространство', 'Покинуть организацию', 'Выйти из организации', 'Выйдите из команды', 'Покинуть сервер',
 'ワークスペースから退出', '組織から脱退', 'チームを離脱する', 'サーバーから退出してください', '작업 공간 나가기', '조직 탈퇴', '팀에서 나가기', '서버 탈퇴하기', '退出工作区', '退出组织', '离开团队', '退出服务器',
 'Çalışma alanından ayrıl', 'Kuruluştan ayrıl', 'Ekipten çık', 'Leave workspace', 'Leave organization']) assert.ok(click(name).includes('permission'), name)
})

test('CU-684 controls: project, negation, past / status, bare verbs and other objects do not take permission, as in English', () => {
  for (const name of ['Quitter', 'Quitter la page', 'Quitter le projet', 'Ne pas quitter l’organisation', 'Vous avez quitté l’organisation', 'Salir', 'Salir de la página', 'Salir del proyecto', 'Has salido de la organización',
 'Verlassen', 'Seite verlassen', 'Projekt verlassen', 'Organisation nicht verlassen', 'Organisation verlassen.x', 'Pagina verlaten', 'Покинуть страницу', 'Вы покинули организацию', 'Выйти',
 '退出', 'ページから退出', '組織から脱退しました', '나가기', '페이지 나가기', '조직에서 탈퇴했습니다', '退出登录', '已退出组织', 'Sayfadan ayrıl', "Don't leave workspace", 'Left workspace', 'Leave project']) assert.ok(!click(name).includes('permission'), name)
})

test('CU-684 design rows (21:17Z): it uscire da / area di lavoro, de austreten aus / Workspace, ja 離れる', () => {
  for (const name of ['Uscire dall’area di lavoro', "Esci dall'organizzazione", 'Uscire dallo spazio di lavoro', 'Aus der Organisation austreten', 'Treten Sie aus der Organisation aus', 'Workspace verlassen',
    'Verlassen Sie den Workspace', '組織を離れる', 'ワークスペースから離れてください']) assert.ok(click(name).includes('permission'), name)
  for (const name of ['Aus dem Verein austreten', 'Uscire dalla pagina', 'Seite verlassen', 'ページを離れる', '組織を離れました']) assert.ok(!click(name).includes('permission'), name)
})
