import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { subscribeVehicles } from '@/utils/firestoreService';
import { formatDate, daysSince } from '@/utils/helpers';
import StatusBadge from '@/components/shared/StatusBadge';
import Modal from '@/components/shared/Modal';
import VehicleTimeline from '@/components/shared/VehicleTimeline';
import { Car, Clock, CheckCircle, AlertTriangle, Plus, ArrowRight, Eye, X } from 'lucide-react';

const STATUS_FILTERS = ['WDA', 'WIA', 'WCA', 'WFA', 'RFD', 'Delivered'];

export default function AdviserDashboard() {
  const { user, userProfile } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Drill-down state
  const [drillFilter, setDrillFilter] = useState(null); // which card was clicked
  const [timelineVehicle, setTimelineVehicle] = useState(null);

  useEffect(() => {
    const unsub = subscribeVehicles((data) => {
      setVehicles(data);
      setLoading(false);
    }, { adviserId: user.uid });
    return unsub;
  }, [user.uid]);

  const count = (status) => vehicles.filter(v => v.currentStatus === status).length;

  const stats = {
    total:   vehicles.length,
    waiting: vehicles.filter(v => ['WDA','WIA'].includes(v.currentStatus)).length,
    pending: vehicles.filter(v => ['WCA','WFA'].includes(v.currentStatus)).length,
    active:  vehicles.filter(v => v.currentStatus !== 'Delivered').length,
  };

  // Vehicles shown in drill-down
  const drillVehicles = drillFilter
    ? (drillFilter === 'total'
        ? vehicles
        : drillFilter === 'waiting'
          ? vehicles.filter(v => ['WDA','WIA'].includes(v.currentStatus))
          : drillFilter === 'pending'
            ? vehicles.filter(v => ['WCA','WFA'].includes(v.currentStatus))
            : drillFilter === 'active'
              ? vehicles.filter(v => v.currentStatus !== 'Delivered')
              : vehicles.filter(v => v.currentStatus === drillFilter))
    : [];

  const drillTitle = {
    total:   'All Vehicles',
    waiting: 'Waiting (WDA / WIA)',
    pending: 'Pending Approval (WCA / WFA)',
    active:  'Active Cases',
  };

  const recent = vehicles.slice(0, 5);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
            Good {new Date().getHours() < 12 ? 'Morning' : 'Afternoon'},{' '}
            <span className="text-gradient">{userProfile?.name?.split(' ')[0]}</span>
          </h1>
          <p className="text-surface-500 mt-0.5 text-sm">Here's what's happening with your vehicles today</p>
        </div>
        <Link to="/adviser/new" className="btn-primary">
          <Plus className="w-4 h-4" /> New Intake
        </Link>
      </div>

      {/* Summary stat cards — clickable */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Car}           label="Total Vehicles"    value={stats.total}   color="brand"  onClick={() => setDrillFilter('total')}   active={drillFilter === 'total'} />
        <StatCard icon={Clock}         label="Waiting (WDA/WIA)" value={stats.waiting} color="yellow" onClick={() => setDrillFilter('waiting')} active={drillFilter === 'waiting'} />
        <StatCard icon={AlertTriangle} label="Pending Approval"  value={stats.pending} color="orange" onClick={() => setDrillFilter('pending')} active={drillFilter === 'pending'} />
        <StatCard icon={CheckCircle}   label="Active Cases"      value={stats.active}  color="green"  onClick={() => setDrillFilter('active')}  active={drillFilter === 'active'} />
      </div>

      {/* Drill-down vehicle list */}
      {drillFilter && (
        <div className="card animate-fade-in">
          <div className="p-4 border-b border-surface-100 dark:border-surface-700 flex items-center justify-between">
            <h2 className="font-bold text-surface-900 dark:text-white text-sm">
              {drillTitle[drillFilter] || `${drillFilter} Vehicles`}
              <span className="ml-2 text-surface-400 font-normal">({drillVehicles.length})</span>
            </h2>
            <button onClick={() => setDrillFilter(null)} className="text-surface-400 hover:text-surface-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="table-wrapper">
            {drillVehicles.length === 0 ? (
              <div className="p-6 text-center text-surface-400 text-sm">No vehicles in this category</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Vehicle No.</th><th>Customer</th><th>Model</th>
                    <th>Status</th><th>Days</th><th>Promise Date</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {drillVehicles.map(v => (
                    <tr key={v.id}>
                      <td className="font-mono font-semibold text-brand-600 dark:text-brand-400">{v.vehicleNumber}</td>
                      <td>
                        <div>{v.customerName}</div>
                        <div className="text-xs text-surface-400">{v.customerMobile}</div>
                      </td>
                      <td>{v.vehicleModel}</td>
                      <td><StatusBadge status={v.currentStatus} /></td>
                      <td>
                        <span className={`font-mono text-xs font-semibold ${daysSince(v.statusEnteredAt) > 2 ? 'text-red-500' : 'text-surface-500'}`}>
                          {daysSince(v.statusEnteredAt)}d
                        </span>
                      </td>
                      <td>{formatDate(v.promisedDeliveryDate)}</td>
                      <td>
                        <button className="btn-ghost btn-sm p-1.5" onClick={() => setTimelineVehicle(v)}>
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Status breakdown cards — clickable */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {STATUS_FILTERS.map(status => (
          <button
            key={status}
            onClick={() => setDrillFilter(prev => prev === status ? null : status)}
            className={`card p-3 text-center cursor-pointer transition-all hover:shadow-md ${drillFilter === status ? 'ring-2 ring-brand-500' : ''}`}
          >
            <div className="text-xl font-bold text-surface-900 dark:text-white">{count(status)}</div>
            <StatusBadge status={status} size="sm" />
          </button>
        ))}
      </div>

      {/* Recent vehicles table */}
      <div className="card">
        <div className="p-5 border-b border-surface-100 dark:border-surface-700 flex items-center justify-between">
          <h2 className="font-bold text-surface-900 dark:text-white">Recent Vehicles</h2>
          <Link to="/adviser/all" className="flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="table-wrapper">
          {loading ? (
            <div className="p-8 text-center text-surface-400">Loading...</div>
          ) : recent.length === 0 ? (
            <div className="p-8 text-center">
              <Car className="w-10 h-10 text-surface-300 mx-auto mb-2" />
              <p className="text-surface-400 text-sm">No vehicles yet. <Link to="/adviser/new" className="text-brand-600">Create your first intake</Link></p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Vehicle No.</th><th>Customer</th><th>Model</th>
                  <th>Status</th><th>Promise Date</th><th>Days</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(v => (
                  <tr key={v.id}>
                    <td className="font-mono font-medium">{v.vehicleNumber}</td>
                    <td>{v.customerName}</td>
                    <td>{v.vehicleModel}</td>
                    <td><StatusBadge status={v.currentStatus} /></td>
                    <td>{formatDate(v.promisedDeliveryDate)}</td>
                    <td>
                      <span className={`font-mono text-xs ${daysSince(v.statusEnteredAt) > 2 ? 'text-red-500' : 'text-surface-500'}`}>
                        {daysSince(v.statusEnteredAt)}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Timeline modal */}
      <Modal isOpen={!!timelineVehicle} onClose={() => setTimelineVehicle(null)} title={`Timeline — ${timelineVehicle?.vehicleNumber}`} size="lg">
        {timelineVehicle && <VehicleTimeline vehicleId={timelineVehicle.id} />}
      </Modal>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, onClick, active }) {
  const colorMap = {
    brand:  'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
    green:  'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
  };
  return (
    <button
      onClick={onClick}
      className={`stat-card text-left w-full cursor-pointer transition-all hover:shadow-md active:scale-[0.98] ${active ? 'ring-2 ring-brand-500' : ''}`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${colorMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-surface-900 dark:text-white">{value}</div>
      <div className="text-xs text-surface-500">{label}</div>
    </button>
  );
}
