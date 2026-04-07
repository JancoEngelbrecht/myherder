/**
 * Help topic registry — defines flow diagram steps for each help topic.
 * Each topic has a getSteps(t, slug) function that returns FlowDiagram-compatible steps.
 */

export const helpTopics = {
  // ── Daily Tasks ──────────────────────────────────────────
  'recording-milk': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.openMilk`), type: 'action', icon: '🥛' },
      { label: t(`help.topics.${s}.flow.selectSession`), type: 'action', icon: '🕐' },
      { label: t(`help.topics.${s}.flow.selectCow`), type: 'action', icon: '🐄' },
      { label: t(`help.topics.${s}.flow.enterLitres`), type: 'action', icon: '📝' },
      {
        label: t(`help.topics.${s}.flow.withdrawalCheck`),
        type: 'decision',
        icon: '⚠',
        branches: [
          {
            label: t('common.yes'),
            nodeLabel: t(`help.topics.${s}.flow.showWarning`),
            type: 'yes',
            icon: '🚨',
            nodeType: 'system',
          },
          {
            label: t('common.no'),
            nodeLabel: t(`help.topics.${s}.flow.normalSave`),
            type: 'no',
            icon: '✅',
            nodeType: 'system',
          },
        ],
      },
    ],
  },
  'milk-history': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.openHistory`), type: 'action', icon: '📊' },
      { label: t(`help.topics.${s}.flow.useFilters`), type: 'action', icon: '🔍' },
      { label: t(`help.topics.${s}.flow.viewRecords`), type: 'system', icon: '📋' },
      { label: t(`help.topics.${s}.flow.sortResults`), type: 'action', icon: '↕' },
    ],
  },

  // ── Health & Treatment ───────────────────────────────────
  'logging-health-issue': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.startIssue`), type: 'action', icon: '🩺' },
      { label: t(`help.topics.${s}.flow.selectCow`), type: 'action', icon: '🐄' },
      { label: t(`help.topics.${s}.flow.selectType`), type: 'action', icon: '🏷' },
      { label: t(`help.topics.${s}.flow.setSeverity`), type: 'action', icon: '⚡' },
      {
        label: t(`help.topics.${s}.flow.isMastitis`),
        type: 'decision',
        icon: '❓',
        branches: [
          {
            label: t('common.yes'),
            nodeLabel: t(`help.topics.${s}.flow.selectTeats`),
            type: 'yes',
            icon: '🫁',
            nodeType: 'action',
          },
          {
            label: t('common.no'),
            nodeLabel: t(`help.topics.${s}.flow.skipTeats`),
            type: 'no',
            icon: '⏭',
            nodeType: 'system',
          },
        ],
      },
      { label: t(`help.topics.${s}.flow.addNotes`), type: 'action', icon: '📝' },
      { label: t(`help.topics.${s}.flow.save`), type: 'system', icon: '✅' },
    ],
  },
  'adding-treatment': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.startTreatment`), type: 'action', icon: '💊' },
      { label: t(`help.topics.${s}.flow.selectCow`), type: 'action', icon: '🐄' },
      { label: t(`help.topics.${s}.flow.selectMedication`), type: 'action', icon: '💊' },
      { label: t(`help.topics.${s}.flow.enterDosage`), type: 'action', icon: '📝' },
      { label: t(`help.topics.${s}.flow.enterCost`), type: 'action', icon: '💰' },
      { label: t(`help.topics.${s}.flow.save`), type: 'action', icon: '✅' },
      { label: t(`help.topics.${s}.flow.withdrawalCalc`), type: 'system', icon: '⏳' },
    ],
  },
  'withdrawal-periods': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.treatmentRecorded`), type: 'system', icon: '💊' },
      { label: t(`help.topics.${s}.flow.systemCalcEnd`), type: 'system', icon: '🖥' },
      { label: t(`help.topics.${s}.flow.milkFlagged`), type: 'system', icon: '🚩' },
      {
        label: t(`help.topics.${s}.flow.periodOver`),
        type: 'decision',
        icon: '❓',
        branches: [
          {
            label: t('common.yes'),
            nodeLabel: t(`help.topics.${s}.flow.milkSafe`),
            type: 'yes',
            icon: '✅',
            nodeType: 'system',
          },
          {
            label: t('common.no'),
            nodeLabel: t(`help.topics.${s}.flow.discardWarning`),
            type: 'no',
            icon: '⚠',
            nodeType: 'system',
          },
        ],
      },
    ],
  },
  'resolving-health-issue': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.openIssues`), type: 'action', icon: '📋' },
      { label: t(`help.topics.${s}.flow.selectIssue`), type: 'action', icon: '👆' },
      { label: t(`help.topics.${s}.flow.changeStatus`), type: 'action', icon: '✅' },
      { label: t(`help.topics.${s}.flow.resolved`), type: 'system', icon: '🎉' },
    ],
  },

  // ── Breeding ─────────────────────────────────────────────
  // breeding-lifecycle uses BreedingLifecycleView directly (no HelpTopicView)

  'logging-heat': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.noticeSigns`), type: 'action', icon: '👀' },
      { label: t(`help.topics.${s}.flow.goToBreeding`), type: 'action', icon: '🔄' },
      { label: t(`help.topics.${s}.flow.selectCow`), type: 'action', icon: '🐄' },
      { label: t(`help.topics.${s}.flow.selectHeat`), type: 'action', icon: '🌡' },
      { label: t(`help.topics.${s}.flow.save`), type: 'action', icon: '✅' },
      { label: t(`help.topics.${s}.flow.systemCalc`), type: 'system', icon: '🖥' },
    ],
  },
  'logging-insemination': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.startLog`), type: 'action', icon: '📝' },
      { label: t(`help.topics.${s}.flow.selectCow`), type: 'action', icon: '🐄' },
      {
        label: t(`help.topics.${s}.flow.selectType`),
        type: 'decision',
        icon: '❓',
        branches: [
          {
            label: t(`help.topics.${s}.flow.ai`),
            nodeLabel: t(`help.topics.${s}.flow.enterSireAI`),
            type: 'yes',
            icon: '💉',
            nodeType: 'action',
          },
          {
            label: t(`help.topics.${s}.flow.bull`),
            nodeLabel: t(`help.topics.${s}.flow.enterSireBull`),
            type: 'no',
            icon: '🐂',
            nodeType: 'action',
          },
        ],
      },
      { label: t(`help.topics.${s}.flow.save`), type: 'action', icon: '✅' },
      { label: t(`help.topics.${s}.flow.systemCalc`), type: 'system', icon: '🖥' },
    ],
  },
  'pregnancy-check': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.startLog`), type: 'action', icon: '📝' },
      { label: t(`help.topics.${s}.flow.selectCow`), type: 'action', icon: '🐄' },
      {
        label: t(`help.topics.${s}.flow.result`),
        type: 'decision',
        icon: '🤰',
        branches: [
          {
            label: t(`help.topics.${s}.flow.positive`),
            nodeLabel: t(`help.topics.${s}.flow.calvingDate`),
            type: 'yes',
            icon: '📅',
            nodeType: 'system',
          },
          {
            label: t(`help.topics.${s}.flow.negative`),
            nodeLabel: t(`help.topics.${s}.flow.backToCycle`),
            type: 'no',
            icon: '🔄',
            nodeType: 'system',
          },
        ],
      },
    ],
  },
  'dry-off': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.notification`), type: 'system', icon: '🔔' },
      { label: t(`help.topics.${s}.flow.goToBreeding`), type: 'action', icon: '🔄' },
      { label: t(`help.topics.${s}.flow.selectCow`), type: 'action', icon: '🐄' },
      { label: t(`help.topics.${s}.flow.selectDryOff`), type: 'action', icon: '🚫' },
      { label: t(`help.topics.${s}.flow.save`), type: 'action', icon: '✅' },
      { label: t(`help.topics.${s}.flow.statusChange`), type: 'system', icon: '📋' },
    ],
  },
  'logging-calving': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.notification`), type: 'system', icon: '🔔' },
      { label: t(`help.topics.${s}.flow.goToBreeding`), type: 'action', icon: '🔄' },
      { label: t(`help.topics.${s}.flow.selectCow`), type: 'action', icon: '🐄' },
      { label: t(`help.topics.${s}.flow.selectCalving`), type: 'action', icon: '🐄' },
      { label: t(`help.topics.${s}.flow.enterDetails`), type: 'action', icon: '📝' },
      { label: t(`help.topics.${s}.flow.save`), type: 'action', icon: '✅' },
      { label: t(`help.topics.${s}.flow.cycleReset`), type: 'system', icon: '🔄' },
    ],
  },
  'breeding-notifications': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.systemAlerts`), type: 'system', icon: '🖥' },
      { label: t(`help.topics.${s}.flow.openNotifications`), type: 'action', icon: '🔔' },
      { label: t(`help.topics.${s}.flow.reviewAlerts`), type: 'action', icon: '👀' },
      {
        label: t(`help.topics.${s}.flow.actionOrDismiss`),
        type: 'decision',
        icon: '❓',
        branches: [
          {
            label: t(`help.topics.${s}.flow.actLabel`),
            nodeLabel: t(`help.topics.${s}.flow.logEvent`),
            type: 'yes',
            icon: '📝',
            nodeType: 'action',
          },
          {
            label: t(`help.topics.${s}.flow.dismissLabel`),
            nodeLabel: t(`help.topics.${s}.flow.dismissed`),
            type: 'no',
            icon: '✖',
            nodeType: 'system',
          },
        ],
      },
    ],
  },

  // ── Cow Management ───────────────────────────────────────
  'adding-cow': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.openList`), type: 'action', icon: '📋' },
      { label: t(`help.topics.${s}.flow.tapAdd`), type: 'action', icon: '➕' },
      { label: t(`help.topics.${s}.flow.fillForm`), type: 'action', icon: '📝' },
      { label: t(`help.topics.${s}.flow.selectBreed`), type: 'action', icon: '🐮' },
      { label: t(`help.topics.${s}.flow.save`), type: 'action', icon: '✅' },
      { label: t(`help.topics.${s}.flow.cowCreated`), type: 'system', icon: '🎉' },
    ],
  },
  'cow-status': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.active`), type: 'action', icon: '🟢' },
      {
        label: t(`help.topics.${s}.flow.statusChange`),
        type: 'decision',
        icon: '❓',
        branches: [
          {
            label: t(`help.topics.${s}.flow.dry`),
            nodeLabel: t(`help.topics.${s}.flow.dryDesc`),
            type: 'yes',
            icon: '🚫',
            nodeType: 'system',
          },
          {
            label: t(`help.topics.${s}.flow.soldDead`),
            nodeLabel: t(`help.topics.${s}.flow.removedDesc`),
            type: 'no',
            icon: '📤',
            nodeType: 'system',
          },
        ],
      },
    ],
  },
  'cow-details': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.openList`), type: 'action', icon: '📋' },
      { label: t(`help.topics.${s}.flow.tapCow`), type: 'action', icon: '👆' },
      { label: t(`help.topics.${s}.flow.viewTabs`), type: 'action', icon: '📑' },
      { label: t(`help.topics.${s}.flow.navigateSub`), type: 'action', icon: '🔍' },
    ],
  },

  // ── Admin / Settings ─────────────────────────────────────
  'managing-users': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.goSettings`), type: 'action', icon: '⚙' },
      { label: t(`help.topics.${s}.flow.openUsers`), type: 'action', icon: '👥' },
      { label: t(`help.topics.${s}.flow.addUser`), type: 'action', icon: '➕' },
      {
        label: t(`help.topics.${s}.flow.selectRole`),
        type: 'decision',
        icon: '❓',
        branches: [
          {
            label: t(`help.topics.${s}.flow.admin`),
            nodeLabel: t(`help.topics.${s}.flow.setPassword`),
            type: 'yes',
            icon: '🔑',
            nodeType: 'action',
          },
          {
            label: t(`help.topics.${s}.flow.worker`),
            nodeLabel: t(`help.topics.${s}.flow.setPin`),
            type: 'no',
            icon: '🔢',
            nodeType: 'action',
          },
        ],
      },
      { label: t(`help.topics.${s}.flow.setPermissions`), type: 'action', icon: '🛡' },
      { label: t(`help.topics.${s}.flow.save`), type: 'action', icon: '✅' },
    ],
  },
  'managing-breed-types': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.goSettings`), type: 'action', icon: '⚙' },
      { label: t(`help.topics.${s}.flow.openBreedTypes`), type: 'action', icon: '🐮' },
      { label: t(`help.topics.${s}.flow.addEdit`), type: 'action', icon: '📝' },
      { label: t(`help.topics.${s}.flow.setTimings`), type: 'action', icon: '📅' },
      { label: t(`help.topics.${s}.flow.save`), type: 'action', icon: '✅' },
    ],
  },
  'managing-issue-types': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.goSettings`), type: 'action', icon: '⚙' },
      { label: t(`help.topics.${s}.flow.openIssueTypes`), type: 'action', icon: '🏷' },
      { label: t(`help.topics.${s}.flow.addEdit`), type: 'action', icon: '📝' },
      { label: t(`help.topics.${s}.flow.save`), type: 'action', icon: '✅' },
    ],
  },
  'managing-medications': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.goSettings`), type: 'action', icon: '⚙' },
      { label: t(`help.topics.${s}.flow.openMedications`), type: 'action', icon: '💊' },
      { label: t(`help.topics.${s}.flow.addEdit`), type: 'action', icon: '📝' },
      { label: t(`help.topics.${s}.flow.setWithdrawal`), type: 'action', icon: '⏳' },
      { label: t(`help.topics.${s}.flow.save`), type: 'action', icon: '✅' },
    ],
  },
  'feature-flags': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.goSettings`), type: 'action', icon: '⚙' },
      { label: t(`help.topics.${s}.flow.openFlags`), type: 'action', icon: '🚩' },
      { label: t(`help.topics.${s}.flow.toggle`), type: 'action', icon: '🔀' },
      { label: t(`help.topics.${s}.flow.immediate`), type: 'system', icon: '⚡' },
    ],
  },
  'farm-settings': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.goSettings`), type: 'action', icon: '⚙' },
      { label: t(`help.topics.${s}.flow.openFarmSettings`), type: 'action', icon: '🏠' },
      { label: t(`help.topics.${s}.flow.editFields`), type: 'action', icon: '📝' },
      { label: t(`help.topics.${s}.flow.save`), type: 'action', icon: '✅' },
    ],
  },
  'running-reports': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.goSettings`), type: 'action', icon: '⚙' },
      { label: t(`help.topics.${s}.flow.openReports`), type: 'action', icon: '📄' },
      { label: t(`help.topics.${s}.flow.selectType`), type: 'action', icon: '📋' },
      { label: t(`help.topics.${s}.flow.setDateRange`), type: 'action', icon: '📅' },
      { label: t(`help.topics.${s}.flow.chooseFormat`), type: 'action', icon: '📁' },
      { label: t(`help.topics.${s}.flow.download`), type: 'system', icon: '⬇' },
    ],
  },
  'audit-log': {
    getSteps: (t, s) => [
      { label: t(`help.topics.${s}.flow.goSettings`), type: 'action', icon: '⚙' },
      { label: t(`help.topics.${s}.flow.openAuditLog`), type: 'action', icon: '📝' },
      { label: t(`help.topics.${s}.flow.setFilters`), type: 'action', icon: '🔍' },
      { label: t(`help.topics.${s}.flow.viewChanges`), type: 'system', icon: '📋' },
    ],
  },
}
