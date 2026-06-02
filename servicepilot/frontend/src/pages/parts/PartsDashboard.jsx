import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { subscribePartsTracking, updatePartsTracking } from '@/utils/firestoreService';
import { formatDate, daysSince } from '@/utils/helpers';
import Modal from '@/components/shared/Modal';
import toast from 'react-hot-toast';
import { Package, Search, RefreshCw, AlertTriangle, Clock, CheckCircle, Eye, User } from 'lucide-react';

const ORDER_STATUSES = ['Pending', 'Ordered', 'Partially Received', 'Fully Received', 'Back Order'];

const STATUS_COLORS = {
  'Pending':           { dot: '#eab308', bg: 'bg-yellow-100 dark:bg-yellow-900/40',  text: 'text-yellow-700 dark:text-yellow-300' },
  'Ordered':           { dot: '#3b82f6', bg: 'bg-blue-100 dark:bg-blue-900/40',      text: 'text-blue-700 dark:text-blue-300' },
  'Partially Received':{ dot: '#f97316', bg: 'bg-orange-100 dark:bg-orange-900/40',  text: 'text-orange-700 dark:text-orange-300' },
  'Fully Received':    { dot: '#22c55e', bg: 'bg-green-100 dark:bg-green-900/40',    text: 'text-green-700 dark:text-green-300' },
  'Back Order':        { dot: '#ef4444', bg: 'bg-red-100 dark:bg-red-900/40',        text: 'text-red-700 dark:text-red-300' },
};

function OrderStatusBadge({ status }) {
  const s = STATUS_COLORS[status] || { dot: '#94a3b8', bg: 'bg-surface-100', text: 'text-surface-600' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {status || 'Unknown'}
    </span>
  );
}

function PartsTimeline({ logs = [] }) {
  if (!logs.length) {
    return <div className="text-surface-400 text-sm py-6 text-center">No update history yet</div>;
  }

  const sorted = [...logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div className="space-y-0">
      {sorted.map((log, i) => {
        const s = STATUS_COLORS[log.orderStatus] || { dot: '#94a3b8' };
        const isLast = i === sorted.length - 1;
        const date = log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true,
        }) : '—';

        return (
          <div key={i} className="flex gap-3 relative">
            {/* Vertical line */}
            {!isLast && (
              <div className="absolute left-[13px] top-7 bottom-0 w-0.5 bg-surface-200 dark:bg-surface-600" />
            )}
            {/* Dot */}
            <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
              style={{ backgroundColor: `${s.dot}20` }}>
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.dot }} />
            </div>
            {/* Content */}
            <div className="flex-1 pb-5">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="font-semibold text-sm text-surface-900 dark:text-white">
                  <OrderStatusBadge status={log.orderStatus} />
                </div>
                <div className="flex items-center gap-1 text-xs text-surface-400">
                  <Clock className="w-3 h-3" />
                  {date}
                </div>
              </div>

              {/* Change summary */}
              {log.summary && (
                <div className="mt-2 text-sm text-surface-700 dark:text-surface-300 bg-surface-50 dark:bg-surface-700/30 rounded-lg px-3 py-2 leading-relaxed">
                  {log.summary.split(' · ').map((line, j) => (
                    <div key={j} className="flex items-start gap-1.5">
                      <span className="text-brand-500 mt-0.5 flex-shrink-0">›</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Remarks */}
              {log.remarks && (
                <div className="mt-1.5 text-sm text-surface-500 dark:text-surface-400 italic px-1">
                  "{log.remarks}"
                </div>
              )}

              {/* Parts count */}
              {log.totalPartsCount > 0 && (
                <div className="mt-1.5 text-xs text-surface-400">
                  Parts: {log.receivedPartsCount ?? 0}/{log.totalPartsCount} received
                  {log.pendingPartsCount > 0 && ` · ${log.pendingPartsCount} pending`}
                </div>
              )}

              {/* Updated by */}
              {log.updatedBy && (
                <div className="flex items-center gap-1 mt-1.5 text-xs text-surface-400">
                  <User className="w-3 h-3" />
                  {log.updatedBy}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PartsDashboard() {
  const { user, userProfile } = useAuth();
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Update modal
  const [selected, setSelected] = useState(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateForm, setUpdateForm] = useState({});
  const [updating, setUpdating] = useState(false);

  // History modal
  const [showHistory, setShowHistory] = useState(false);
  const [historyVehicle, setHistoryVehicle] = useState(null);

  useEffect(() => {
    const unsub = subscribePartsTracking((data) => {
      setParts(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = parts.filter(p =>
    !search ||
    p.vehicleNumber?.toLowerCase().includes(search.toLowerCase()) ||
    p.jobCardNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total:    parts.length,
    pending:  parts.filter(p => p.orderStatus === 'Pending').length,
    backOrder:parts.filter(p => p.orderStatus === 'Back Order').length,
    received: parts.filter(p => p.orderStatus === 'Fully Received').length,
  };

  const openUpdate = (part) => {
    setSelected(part);
    setUpdateForm({
      orderStatus:        part.orderStatus || 'Pending',
      orderDate:          toDateInput(part.orderDate),
      etaDate:            toDateInput(part.etaDate),
      receivedDate:       toDateInput(part.receivedDate),
      vendorName:         part.vendorName || '',
      invoiceNumber:      part.invoiceNumber || '',
      totalPartsCount:    part.totalPartsCount || 0,
      receivedPartsCount: part.receivedPartsCount || 0,
      pendingPartsCount:  part.pendingPartsCount || 0,
      pendingItems:       Array.isArray(part.pendingItems) ? part.pendingItems.join(', ') : (part.pendingItems || ''),
      backOrderItems:     Array.isArray(part.backOrderItems) ? part.backOrderItems.join(', ') : (part.backOrderItems || ''),
      remarks:            '',
    });
    setShowUpdate(true);
  };

  const handleUpdate = async () => {
    if (!selected) return;
    setUpdating(true);
    try {
      const pendingPartsCount = Math.max(0, (updateForm.totalPartsCount || 0) - (updateForm.receivedPartsCount || 0));
      await updatePartsTracking(
        selected.id,
        { ...updateForm, pendingPartsCount },
        userProfile?.name || user.email,
        selected  // pass previous data for diff
      );
      toast.success('Parts tracking updated');
      setShowUpdate(false);
    } catch (err) {
      toast.error(err.message || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const set = (k) => (e) => setUpdateForm(f => ({ ...f, [k]: e.target.type === 'number' ? +e.target.value : e.target.value }));

  const isEtaExceeded = (p) => {
    if (!p.etaDate || p.orderStatus === 'Fully Received') return false;
    const eta = p.etaDate?.seconds ? new Date(p.etaDate.seconds * 1000) : new Date(p.etaDate);
    return eta < new Date();
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Parts Allocator Dashboard</h1>
        <p className="text-surface-500 text-sm mt-0.5">Track PNA vehicles and parts availability</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Package}       label="Total PNA"      value={stats.total}     color="purple" />
        <StatCard icon={Clock}         label="Pending Order"  value={stats.pending}   color="yellow" />
        <StatCard icon={AlertTriangle} label="Back Order"     value={stats.backOrder} color="red"    />
        <StatCard icon={CheckCircle}   label="Fully Received" value={stats.received}  color="green"  />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input className="input pl-9" placeholder="Search by vehicle number or job card..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrapper">
          {loading ? (
            <div className="p-8 text-center text-surface-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <Package className="w-12 h-12 text-surface-300 mx-auto mb-3" />
              <p className="text-surface-400 text-sm">No PNA vehicles in queue</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Vehicle No.</th><th>Job Card</th><th>Order Status</th>
                  <th>ETA Date</th><th>Parts Progress</th><th>Vendor</th>
                  <th>Updates</th><th>Days</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const exceeded = isEtaExceeded(p);
                  const progress = p.totalPartsCount > 0
                    ? Math.round((p.receivedPartsCount / p.totalPartsCount) * 100) : 0;
                  const etaStr = p.etaDate?.seconds
                    ? new Date(p.etaDate.seconds * 1000).toLocaleDateString('en-IN')
                    : p.etaDate || '—';
                  return (
                    <tr key={p.id}>
                      <td className="font-mono font-semibold text-brand-600 dark:text-brand-400">{p.vehicleNumber}</td>
                      <td className="font-mono text-sm">{p.jobCardNumber || '—'}</td>
                      <td><OrderStatusBadge status={p.orderStatus} /></td>
                      <td>
                        <div className={`text-sm flex items-center gap-1 ${exceeded ? 'text-red-500 font-medium' : ''}`}>
                          {exceeded && <AlertTriangle className="w-3 h-3 flex-shrink-0" />}
                          {etaStr}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-surface-200 dark:bg-surface-600 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-xs text-surface-500">{p.receivedPartsCount}/{p.totalPartsCount}</span>
                        </div>
                      </td>
                      <td className="text-sm">{p.vendorName || '—'}</td>
                      <td>
                        <button
                          className="text-xs text-brand-500 hover:text-brand-700 hover:underline flex items-center gap-1"
                          onClick={() => { setHistoryVehicle(p); setShowHistory(true); }}
                        >
                          <Eye className="w-3 h-3" />
                          {p.logs?.length || 0} log{p.logs?.length !== 1 ? 's' : ''}
                        </button>
                      </td>
                      <td>
                        <span className={`font-mono text-xs ${exceeded ? 'text-red-500 font-bold' : 'text-surface-500'}`}>
                          {daysSince(p.createdAt)}d
                        </span>
                      </td>
                      <td>
                        <button className="btn-primary btn-sm" onClick={() => openUpdate(p)}>
                          <RefreshCw className="w-3 h-3" /> Update
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Update Modal ── */}
      <Modal isOpen={showUpdate} onClose={() => setShowUpdate(false)} title={`Update Parts — ${selected?.vehicleNumber}`} size="lg">
        {selected && (
          <div className="space-y-4 p-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Order Status</label>
                <select className="select" value={updateForm.orderStatus} onChange={set('orderStatus')}>
                  {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Vendor Name</label>
                <input className="input" placeholder="e.g. SKODA" value={updateForm.vendorName} onChange={set('vendorName')} />
              </div>
              <div>
                <label className="label">Order Date</label>
                <input type="date" className="input" value={updateForm.orderDate} onChange={set('orderDate')} />
              </div>
              <div>
                <label className="label">ETA Date</label>
                <input type="date" className="input" value={updateForm.etaDate} onChange={set('etaDate')} />
              </div>
              <div>
                <label className="label">Received Date</label>
                <input type="date" className="input" value={updateForm.receivedDate} onChange={set('receivedDate')} />
              </div>
              <div>
                <label className="label">Invoice Number</label>
                <input className="input" placeholder="INV-001" value={updateForm.invoiceNumber} onChange={set('invoiceNumber')} />
              </div>
              <div>
                <label className="label">Total Parts</label>
                <input type="number" min="0" className="input" value={updateForm.totalPartsCount} onChange={set('totalPartsCount')} />
              </div>
              <div>
                <label className="label">Received Parts</label>
                <input type="number" min="0" className="input" value={updateForm.receivedPartsCount} onChange={set('receivedPartsCount')} />
              </div>
              <div className="col-span-2">
                <label className="label">Pending Items</label>
                <textarea className="input" rows={2} placeholder="List pending parts..." value={updateForm.pendingItems} onChange={set('pendingItems')} />
              </div>
              <div className="col-span-2">
                <label className="label">Back Order Items</label>
                <textarea className="input" rows={2} placeholder="Back-ordered parts..." value={updateForm.backOrderItems} onChange={set('backOrderItems')} />
              </div>
              <div className="col-span-2">
                <label className="label">Remarks <span className="text-surface-400 font-normal">(optional note for this update)</span></label>
                <textarea className="input" rows={2} placeholder="e.g. Bumper back-ordered, rest received..." value={updateForm.remarks} onChange={set('remarks')} />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={() => setShowUpdate(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleUpdate} disabled={updating}>
                {updating ? 'Saving...' : 'Save Update'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── History / Timeline Modal ── */}
      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title={`Parts Update History — ${historyVehicle?.vehicleNumber}`} size="lg">
        {historyVehicle && (() => {
          // Always read live data so updates show immediately without reopening
          const live = parts.find(p => p.id === historyVehicle.id) || historyVehicle;
          return (
            <div className="p-1">
              <div className="flex items-center gap-3 mb-5 bg-surface-50 dark:bg-surface-700/30 rounded-xl p-3">
                <div>
                  <div className="font-mono font-semibold text-brand-600">{live.vehicleNumber}</div>
                  <div className="text-xs text-surface-400">{live.jobCardNumber || 'No job card'} · Adviser: {live.adviserName}</div>
                </div>
                <div className="ml-auto">
                  <OrderStatusBadge status={live.orderStatus} />
                </div>
              </div>
              <PartsTimeline logs={live.logs || []} />
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

function toDateInput(val) {
  if (!val) return '';
  if (val?.seconds) return new Date(val.seconds * 1000).toISOString().split('T')[0];
  if (typeof val === 'string') return val.split('T')[0];
  return val;
}

function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
    red:    'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    green:  'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
  };
  return (
    <div className="stat-card">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${colorMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-surface-900 dark:text-white">{value}</div>
      <div className="text-xs text-surface-500">{label}</div>
    </div>
  );
}
