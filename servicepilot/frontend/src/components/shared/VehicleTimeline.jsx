import React, { useEffect, useState } from 'react';
import { subscribeVehicleHistory } from '@/utils/firestoreService';
import { formatDateTime } from '@/utils/helpers';
import { STATUS_LABELS, STATUS_COLORS } from '@/utils/constants';
import { Clock, User, Package } from 'lucide-react';

const ORDER_STATUS_COLORS = {
  'Pending':            '#eab308',
  'Ordered':            '#3b82f6',
  'Partially Received': '#f97316',
  'Fully Received':     '#22c55e',
  'Back Order':         '#ef4444',
};

export default function VehicleTimeline({ vehicleId }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!vehicleId) return;
    const unsub = subscribeVehicleHistory(vehicleId, setHistory);
    return unsub;
  }, [vehicleId]);

  if (!history.length) {
    return <div className="text-surface-400 text-sm py-4 text-center">No history yet</div>;
  }

  return (
    <div className="space-y-0">
      {history.map((entry, i) => {
        const isPartsUpdate = entry.entryType === 'parts_update';
        const isLast = i === history.length - 1;

        if (isPartsUpdate) {
          return (
            <PartsUpdateEntry
              key={entry.id}
              entry={entry}
              isLast={isLast}
            />
          );
        }

        return (
          <StatusChangeEntry
            key={entry.id}
            entry={entry}
            isLast={isLast}
          />
        );
      })}
    </div>
  );
}

// ── Regular status change entry ───────────────────────────────────────────────
function StatusChangeEntry({ entry, isLast }) {
  const color = STATUS_COLORS[entry.status] || '#64748b';
  return (
    <div className="timeline-item">
      {!isLast && <div className="timeline-line" />}
      <div
        className="timeline-dot w-7 h-7 flex-shrink-0"
        style={{ backgroundColor: `${color}20`, color }}
      >
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-sm text-surface-900 dark:text-white">
              {STATUS_LABELS[entry.status] || entry.status}
              {entry.subStatus && (
                <span className="ml-1 text-surface-400 font-normal">— {entry.subStatus}</span>
              )}
            </div>
            {entry.previousStatus && entry.previousStatus !== entry.status && (
              <div className="text-xs text-surface-400 mt-0.5">
                From: {STATUS_LABELS[entry.previousStatus] || entry.previousStatus}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-surface-400 flex-shrink-0">
            <Clock className="w-3 h-3" />
            {formatDateTime(entry.timestamp)}
          </div>
        </div>
        {entry.remarks && (
          <div className="mt-1.5 text-sm text-surface-600 dark:text-surface-400 bg-surface-50 dark:bg-surface-700/30 rounded-lg px-3 py-2">
            {entry.remarks}
          </div>
        )}
        {entry.updatedBy && (
          <div className="flex items-center gap-1 mt-1.5 text-xs text-surface-400">
            <User className="w-3 h-3" />
            Updated by: {entry.updatedBy}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Parts allocator update entry ──────────────────────────────────────────────
function PartsUpdateEntry({ entry, isLast }) {
  const orderColor = ORDER_STATUS_COLORS[entry.orderStatus] || '#94a3b8';

  return (
    <div className="timeline-item">
      {!isLast && <div className="timeline-line" />}
      {/* Distinct dot — package icon tinted with order status colour */}
      <div
        className="timeline-dot w-7 h-7 flex-shrink-0"
        style={{ backgroundColor: `${orderColor}20`, color: orderColor }}
      >
        <Package className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            {/* Order status badge */}
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${orderColor}20`, color: orderColor }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: orderColor }} />
                {entry.orderStatus || 'Parts Update'}
              </span>
              <span className="text-xs text-surface-400">Parts Update</span>
            </div>
            {/* Parts count */}
            {entry.totalPartsCount > 0 && (
              <div className="text-xs text-surface-400 mt-1">
                {entry.receivedPartsCount ?? 0}/{entry.totalPartsCount} parts received
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-surface-400 flex-shrink-0">
            <Clock className="w-3 h-3" />
            {formatDateTime(entry.timestamp)}
          </div>
        </div>

        {/* Change summary — each change on its own line */}
        {entry.summary && entry.summary !== 'Parts details updated' && (
          <div className="mt-2 text-sm text-surface-600 dark:text-surface-400 bg-surface-50 dark:bg-surface-700/30 rounded-lg px-3 py-2 leading-relaxed">
            {entry.summary.split(' · ').map((line, j) => (
              <div key={j} className="flex items-start gap-1.5">
                <span className="text-brand-500 mt-0.5 flex-shrink-0">›</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        )}

        {entry.remarks && (
          <div className="mt-1.5 text-sm text-surface-500 dark:text-surface-400 italic px-1">
            "{entry.remarks}"
          </div>
        )}

        {entry.updatedBy && (
          <div className="flex items-center gap-1 mt-1.5 text-xs text-surface-400">
            <User className="w-3 h-3" />
            Updated by: {entry.updatedBy}
          </div>
        )}
      </div>
    </div>
  );
}
