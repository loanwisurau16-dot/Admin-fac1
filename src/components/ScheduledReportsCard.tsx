import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import {
  AdminState,
  ReportFrequency,
  ReportWeekday,
  ScheduledReportConfig,
} from '../types';
import { sanitizeText } from '../utils/helpers';
import {
  computeNextReportRunAt,
  formatWeekdayLabel,
  GeneratedPdfReport,
  generateExecutivePdfReport,
} from '../utils/pdfReportGenerator';

interface ScheduledReportsCardProps {
  state: AdminState;
  adminEmail: string;
  latestGeneratedReport: GeneratedPdfReport | null;
  onTriggerReportDispatch: (
    source: 'MANUAL' | 'SCHEDULED',
    overrideConfig?: ScheduledReportConfig
  ) => Promise<GeneratedPdfReport | null>;
  onToast: (msg: string, type?: 'info' | 'success' | 'danger' | 'warning') => void;
}

const WEEKDAYS: Array<{ value: ReportWeekday; label: string }> = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

export function ScheduledReportsCard({
  state,
  adminEmail,
  latestGeneratedReport,
  onTriggerReportDispatch,
  onToast,
}: ScheduledReportsCardProps) {
  const savedCfg = state.scheduledReportConfig || {};
  const defaultEmail =
    savedCfg.emailRecipients ?? state.settings?.supportEmail ?? adminEmail ?? '';
  const defaultWhatsapp =
    savedCfg.whatsappNumber ??
    state.settings?.supportWhatsapp ??
    state.settings?.supportPhone ??
    '';

  const [enabled, setEnabled] = useState<boolean>(Boolean(savedCfg.enabled));
  const [frequency, setFrequency] = useState<ReportFrequency>(
    savedCfg.frequency || 'DAILY'
  );
  const [weekday, setWeekday] = useState<ReportWeekday>(
    savedCfg.weekday !== undefined ? savedCfg.weekday : 1
  );
  const [timeOfDay, setTimeOfDay] = useState<string>(
    savedCfg.timeOfDay || '09:00'
  );
  const [sendViaEmail, setSendViaEmail] = useState<boolean>(
    savedCfg.sendViaEmail !== false
  );
  const [emailRecipients, setEmailRecipients] = useState<string>(defaultEmail);
  const [sendViaWhatsapp, setSendViaWhatsapp] = useState<boolean>(
    savedCfg.sendViaWhatsapp !== false
  );
  const [whatsappNumber, setWhatsappNumber] = useState<string>(defaultWhatsapp);
  const [includeFinancials, setIncludeFinancials] = useState<boolean>(
    savedCfg.includeFinancials !== false
  );
  const [includeTopStores, setIncludeTopStores] = useState<boolean>(
    savedCfg.includeTopStores !== false
  );
  const [includeRiderCash, setIncludeRiderCash] = useState<boolean>(
    savedCfg.includeRiderCash !== false
  );
  const [autoDownloadPdf, setAutoDownloadPdf] = useState<boolean>(
    savedCfg.autoDownloadPdf !== false
  );
  const [webhookUrl, setWebhookUrl] = useState<string>(
    savedCfg.webhookUrl || ''
  );
  const [saving, setSaving] = useState(false);
  const [runningDispatch, setRunningDispatch] = useState(false);

  useEffect(() => {
    const cfg = state.scheduledReportConfig || {};
    setEnabled(Boolean(cfg.enabled));
    setFrequency(cfg.frequency || 'DAILY');
    setWeekday(cfg.weekday !== undefined ? cfg.weekday : 1);
    setTimeOfDay(cfg.timeOfDay || '09:00');
    setSendViaEmail(cfg.sendViaEmail !== false);
    setEmailRecipients(
      cfg.emailRecipients ?? state.settings?.supportEmail ?? adminEmail ?? ''
    );
    setSendViaWhatsapp(cfg.sendViaWhatsapp !== false);
    setWhatsappNumber(
      cfg.whatsappNumber ??
        state.settings?.supportWhatsapp ??
        state.settings?.supportPhone ??
        ''
    );
    setIncludeFinancials(cfg.includeFinancials !== false);
    setIncludeTopStores(cfg.includeTopStores !== false);
    setIncludeRiderCash(cfg.includeRiderCash !== false);
    setAutoDownloadPdf(cfg.autoDownloadPdf !== false);
    setWebhookUrl(cfg.webhookUrl || '');
  }, [
    state.scheduledReportConfig,
    state.settings?.supportEmail,
    state.settings?.supportWhatsapp,
    state.settings?.supportPhone,
    adminEmail,
  ]);

  const draftConfig: ScheduledReportConfig = useMemo(
    () => ({
      enabled,
      frequency,
      weekday,
      timeOfDay: timeOfDay || '09:00',
      sendViaEmail,
      emailRecipients: emailRecipients.trim(),
      sendViaWhatsapp,
      whatsappNumber: whatsappNumber.trim(),
      includeFinancials,
      includeTopStores,
      includeRiderCash,
      autoDownloadPdf,
      webhookUrl: webhookUrl.trim(),
    }),
    [
      enabled,
      frequency,
      weekday,
      timeOfDay,
      sendViaEmail,
      emailRecipients,
      sendViaWhatsapp,
      whatsappNumber,
      includeFinancials,
      includeTopStores,
      includeRiderCash,
      autoDownloadPdf,
      webhookUrl,
    ]
  );

  const previewNextRunAt = useMemo(
    () =>
      computeNextReportRunAt(
        frequency,
        timeOfDay || '09:00',
        weekday,
        Date.now()
      ),
    [frequency, timeOfDay, weekday]
  );

  const canNativeShareFiles = useMemo(() => {
    try {
      return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
    } catch {
      return false;
    }
  }, []);

  const dispatchHistory = useMemo(() => {
    return Object.entries(state.reportDispatchLogs || {})
      .map(([id, rec]) => ({ id, ...rec }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 8);
  }, [state.reportDispatchLogs]);

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enabled && !sendViaEmail && !sendViaWhatsapp && !webhookUrl.trim()) {
      onToast(
        'Select at least Email, WhatsApp, or a Webhook URL to enable scheduled reports.',
        'warning'
      );
      return;
    }
    if (sendViaEmail && !emailRecipients.trim()) {
      onToast('Enter at least one recipient email address.', 'warning');
      return;
    }
    if (sendViaWhatsapp && whatsappNumber.replace(/\D/g, '').length < 10) {
      onToast(
        'Enter a valid 10-digit WhatsApp phone number for WhatsApp delivery.',
        'warning'
      );
      return;
    }
    if (webhookUrl.trim()) {
      try {
        const parsed = new URL(webhookUrl.trim());
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          throw new Error('Invalid protocol');
        }
      } catch {
        onToast('Webhook URL must be a valid http(s):// URL.', 'danger');
        return;
      }
    }

    setSaving(true);
    try {
      const nextRunAt = enabled
        ? computeNextReportRunAt(
            frequency,
            timeOfDay || '09:00',
            weekday,
            Date.now()
          )
        : null;

      await db.ref('admin/scheduledReportConfig').update({
        enabled,
        frequency,
        weekday,
        timeOfDay: timeOfDay || '09:00',
        sendViaEmail,
        emailRecipients: sanitizeText(emailRecipients.trim()),
        sendViaWhatsapp,
        whatsappNumber: sanitizeText(whatsappNumber.trim()),
        includeFinancials,
        includeTopStores,
        includeRiderCash,
        autoDownloadPdf,
        webhookUrl: webhookUrl.trim(),
        nextRunAt: nextRunAt || 0,
        updatedAt: Date.now(),
        updatedBy: adminEmail,
      });

      onToast(
        enabled
          ? `Automated ${frequency.toLowerCase()} PDF report scheduled (${new Date(
              nextRunAt || Date.now()
            ).toLocaleString('en-IN')}).`
          : 'Automated report schedule saved (currently paused).',
        'success'
      );
    } catch (err) {
      onToast(`Failed to save schedule: ${(err as Error).message}`, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadOnly = () => {
    const report = generateExecutivePdfReport({
      state,
      config: draftConfig,
      adminEmail,
      frequencyOverride: frequency,
    });
    report.download();
    onToast(`Downloaded ${report.filename}`, 'success');
  };

  const handleRunAndSendNow = async () => {
    setRunningDispatch(true);
    try {
      await onTriggerReportDispatch('MANUAL', draftConfig);
    } finally {
      setRunningDispatch(false);
    }
  };

  const handleNativeSharePdf = async (report: GeneratedPdfReport) => {
    try {
      const file = new File([report.blob], report.filename, {
        type: 'application/pdf',
      });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: report.emailSubject,
          text: report.summaryText.replace(/\*/g, ''),
          files: [file],
        });
        onToast('Shared PDF report via system share sheet.', 'success');
      } else {
        report.download();
        onToast(
          'Direct file sharing not supported in this browser — PDF downloaded instead.',
          'info'
        );
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onToast('Share cancelled or unavailable — PDF downloaded.', 'info');
      }
    }
  };

  return (
    <div className="card scheduled-reports-card">
      <div className="card-title" style={{ marginBottom: '0.65rem' }}>
        <div>
          <span>
            <i
              className="fa-solid fa-file-pdf"
              style={{ color: '#dc2626', marginRight: '8px' }}
            ></i>
            Schedule Automated PDF Reports
          </span>
          <div className="scheduled-reports-subtitle">
            {savedCfg.enabled && savedCfg.nextRunAt
              ? `Active · ${savedCfg.frequency === 'WEEKLY' ? `Weekly (${formatWeekdayLabel(savedCfg.weekday ?? 1)})` : 'Daily'} at ${savedCfg.timeOfDay || '09:00'} · Next run: ${new Date(savedCfg.nextRunAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
              : 'Schedule paused · Configure daily or weekly PDF generation & delivery'}
          </div>
        </div>

        <label className="schedule-switch-label" htmlFor="auto-report-enabled-toggle">
          <input
            id="auto-report-enabled-toggle"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>{enabled ? 'Schedule Enabled' : 'Paused'}</span>
        </label>
      </div>

      <form onSubmit={handleSaveSchedule}>
        <div className="scheduled-reports-grid">
          {/* LEFT: CADENCE & SCHEDULE */}
          <div className="scheduled-reports-pane">
            <div className="scheduled-pane-title">1. Cadence &amp; Timing</div>

            <div className="form-group">
              <label>Report Frequency</label>
              <div
                className="rider-chart-segmented"
                role="tablist"
                aria-label="Scheduled report frequency"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={frequency === 'DAILY'}
                  className={`rider-chart-seg-btn ${frequency === 'DAILY' ? 'active' : ''}`}
                  onClick={() => setFrequency('DAILY')}
                >
                  Daily Report
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={frequency === 'WEEKLY'}
                  className={`rider-chart-seg-btn ${frequency === 'WEEKLY' ? 'active' : ''}`}
                  onClick={() => setFrequency('WEEKLY')}
                >
                  Weekly Report
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  frequency === 'WEEKLY' ? '1fr 1fr' : '1fr',
                gap: '10px',
              }}
            >
              {frequency === 'WEEKLY' && (
                <div className="form-group">
                  <label htmlFor="report-weekday-select">Day of Week</label>
                  <select
                    id="report-weekday-select"
                    className="form-select"
                    value={weekday}
                    onChange={(e) =>
                      setWeekday(Number(e.target.value) as ReportWeekday)
                    }
                  >
                    {WEEKDAYS.map((d) => (
                      <option key={d.value} value={d.value}>
                        Every {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="report-time-input">Dispatch Time (Local)</label>
                <input
                  id="report-time-input"
                  type="time"
                  className="form-input"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="scheduled-next-preview">
              Next scheduled generation:{' '}
              <strong>
                {new Date(previewNextRunAt).toLocaleString('en-IN', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
            </div>

            <div className="scheduled-checks-group">
              <div className="scheduled-pane-title" style={{ marginTop: '0.6rem' }}>
                Included PDF Sections
              </div>
              <label className="scheduled-check-row">
                <input
                  type="checkbox"
                  checked={includeFinancials}
                  onChange={(e) => setIncludeFinancials(e.target.checked)}
                />
                <span>Executive Financial &amp; Commission Ledger</span>
              </label>
              <label className="scheduled-check-row">
                <input
                  type="checkbox"
                  checked={includeTopStores}
                  onChange={(e) => setIncludeTopStores(e.target.checked)}
                />
                <span>Top Performing Stores Breakdown</span>
              </label>
              <label className="scheduled-check-row">
                <input
                  type="checkbox"
                  checked={includeRiderCash}
                  onChange={(e) => setIncludeRiderCash(e.target.checked)}
                />
                <span>Fleet Delivery Trips &amp; COD Cash Held</span>
              </label>
              <label className="scheduled-check-row">
                <input
                  type="checkbox"
                  checked={autoDownloadPdf}
                  onChange={(e) => setAutoDownloadPdf(e.target.checked)}
                />
                <span>Auto-download PDF file when triggered</span>
              </label>
            </div>
          </div>

          {/* RIGHT: DELIVERY CHANNELS */}
          <div className="scheduled-reports-pane">
            <div className="scheduled-pane-title">
              2. Delivery Channels (Email &amp; WhatsApp)
            </div>

            <div className="scheduled-channel-block">
              <label className="scheduled-check-row" style={{ marginBottom: '6px' }}>
                <input
                  type="checkbox"
                  checked={sendViaEmail}
                  onChange={(e) => setSendViaEmail(e.target.checked)}
                />
                <span>
                  <i
                    className="fa-solid fa-envelope"
                    style={{ color: '#0284c7', marginRight: '6px' }}
                  ></i>
                  Send via Email
                </span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="admin@store.com, finance@store.com"
                value={emailRecipients}
                onChange={(e) => setEmailRecipients(e.target.value)}
                disabled={!sendViaEmail}
                aria-label="Recipient email addresses"
              />
              <small className="scheduled-field-hint">
                Comma-separated recipient emails. Prepares pre-filled email dispatch &amp; PDF file.
              </small>
            </div>

            <div className="scheduled-channel-block">
              <label className="scheduled-check-row" style={{ marginBottom: '6px' }}>
                <input
                  type="checkbox"
                  checked={sendViaWhatsapp}
                  onChange={(e) => setSendViaWhatsapp(e.target.checked)}
                />
                <span>
                  <i
                    className="fa-brands fa-whatsapp"
                    style={{ color: '#16a34a', marginRight: '6px' }}
                  ></i>
                  Send via WhatsApp
                </span>
              </label>
              <input
                type="tel"
                className="form-input"
                placeholder="e.g. 9876543210"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                disabled={!sendViaWhatsapp}
                aria-label="Recipient WhatsApp number"
              />
              <small className="scheduled-field-hint">
                Recipient WhatsApp number with or without +91 country code.
              </small>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="report-webhook-input">
                Optional Webhook URL (Unattended Relay)
              </label>
              <input
                id="report-webhook-input"
                type="url"
                className="form-input"
                placeholder="https://your-relay.example.com/send-report"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <small className="scheduled-field-hint">
                Optional: POSTs PDF base64 + metrics JSON to a Cloud Function, Make, or Zapier email/WhatsApp relay when due.
              </small>
            </div>
          </div>
        </div>

        <div className="scheduled-actions-bar">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={saving}
          >
            <i className="fa-solid fa-calendar-check"></i>{' '}
            {saving ? 'Saving...' : 'Save Schedule'}
          </button>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleDownloadOnly}
          >
            <i className="fa-solid fa-file-arrow-down"></i> Download{' '}
            {frequency === 'DAILY' ? 'Daily' : 'Weekly'} PDF
          </button>

          <button
            type="button"
            className="btn btn-info btn-sm"
            onClick={handleRunAndSendNow}
            disabled={runningDispatch}
          >
            <i className="fa-solid fa-paper-plane"></i>{' '}
            {runningDispatch ? 'Generating...' : 'Generate & Send Now'}
          </button>
        </div>
      </form>

      {/* ACTIVE GENERATED PDF DISPATCH BAR */}
      {latestGeneratedReport && (
        <div className="scheduled-dispatch-ready">
          <div className="scheduled-dispatch-ready-info">
            <div style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0f172a' }}>
              <i
                className="fa-solid fa-circle-check"
                style={{ color: '#16a34a', marginRight: '6px' }}
              ></i>
              Ready to Dispatch: {latestGeneratedReport.filename}
            </div>
            <div className="scheduled-dispatch-metrics">
              {latestGeneratedReport.periodLabel} ·{' '}
              {latestGeneratedReport.deliveredOrders}/
              {latestGeneratedReport.totalOrders} delivered · Revenue ₹
              {latestGeneratedReport.grossRevenue.toFixed(0)} · Commission ₹
              {latestGeneratedReport.adminCommission.toFixed(2)}
            </div>
          </div>

          <div className="scheduled-dispatch-ready-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={latestGeneratedReport.download}
            >
              <i className="fa-solid fa-download"></i> Save PDF
            </button>

            {sendViaEmail && (
              <a
                href={latestGeneratedReport.mailtoHref}
                className="btn btn-info btn-sm"
                title="Open email draft with report summary"
              >
                <i className="fa-solid fa-envelope"></i> Send Email
              </a>
            )}

            {sendViaWhatsapp && latestGeneratedReport.whatsappHref && (
              <a
                href={latestGeneratedReport.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-success btn-sm"
                title="Send report summary via WhatsApp"
              >
                <i className="fa-brands fa-whatsapp"></i> Send WhatsApp
              </a>
            )}

            {canNativeShareFiles && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => handleNativeSharePdf(latestGeneratedReport)}
                title="Share PDF attachment using device share sheet"
              >
                <i className="fa-solid fa-share-nodes"></i> Share File
              </button>
            )}
          </div>
        </div>
      )}

      {/* DISPATCH HISTORY TABLE */}
      <div className="scheduled-history-wrap">
        <div className="scheduled-pane-title" style={{ marginBottom: '0.5rem' }}>
          Recent Automated &amp; Manual Report Runs
        </div>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Generated At</th>
                <th>Cycle &amp; File</th>
                <th>Channels</th>
                <th>Snapshot</th>
                <th>Status</th>
                <th>Quick Resend</th>
              </tr>
            </thead>
            <tbody>
              {dispatchHistory.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: '0.8rem',
                    }}
                  >
                    No automated or manual PDF report runs recorded yet. Click
                    &ldquo;Generate &amp; Send Now&rdquo; to create your first PDF report.
                  </td>
                </tr>
              ) : (
                dispatchHistory.map((log) => {
                  const regenerate = () =>
                    generateExecutivePdfReport({
                      state,
                      config: draftConfig,
                      adminEmail,
                      frequencyOverride: log.frequency,
                    });

                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize: '0.76rem', fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(log.createdAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {log.triggerSource === 'SCHEDULED' ? 'Auto-Schedule' : 'Manual'}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>
                          {log.periodLabel}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {log.filename}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.74rem' }}>
                        <div style={{ fontWeight: 700 }}>
                          {(log.channels || []).join(' · ') || 'PDF'}
                        </div>
                        <div
                          style={{
                            fontSize: '0.68rem',
                            color: 'var(--text-muted)',
                            maxWidth: '180px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={log.recipientsSummary}
                        >
                          {log.recipientsSummary || adminEmail}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.76rem', fontVariantNumeric: 'tabular-nums' }}>
                        <strong>₹{Number(log.grossRevenue || 0).toFixed(0)}</strong>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {log.deliveredOrders} delivered · ₹
                          {Number(log.adminCommission || 0).toFixed(0)} comm.
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            log.status === 'WEBHOOK_SENT'
                              ? 'badge-success'
                              : log.status === 'WEBHOOK_FAILED'
                              ? 'badge-danger'
                              : 'badge-info'
                          }`}
                        >
                          {log.status === 'WEBHOOK_SENT'
                            ? 'Sent (Webhook)'
                            : log.status === 'WEBHOOK_FAILED'
                            ? 'Webhook Failed'
                            : log.status === 'READY_TO_SEND'
                            ? 'Ready to Send'
                            : 'Downloaded'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            title="Re-download PDF for this cycle"
                            onClick={() => {
                              const r = regenerate();
                              r.download();
                              onToast(`Downloaded ${r.filename}`, 'success');
                            }}
                          >
                            <i className="fa-solid fa-download"></i>
                          </button>
                          {sendViaEmail && (
                            <a
                              href={regenerate().mailtoHref}
                              className="btn btn-outline btn-sm"
                              title="Open email draft"
                            >
                              <i className="fa-solid fa-envelope" style={{ color: '#0284c7' }}></i>
                            </a>
                          )}
                          {sendViaWhatsapp && whatsappNumber.replace(/\D/g, '').length >= 10 && (
                            <a
                              href={regenerate().whatsappHref || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="whatsapp-icon-link"
                              title="Send via WhatsApp"
                            >
                              <i className="fa-brands fa-whatsapp"></i>
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
