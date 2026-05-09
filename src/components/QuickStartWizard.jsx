import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    CheckCircle2, 
    Circle, 
    ChevronRight, 
    X, 
    LayoutDashboard, 
    Stethoscope, 
    Activity, 
    Monitor, 
    Network, 
    Settings,
    ChevronUp,
    ChevronDown,
    Zap,
    UserPlus
} from 'lucide-react';
import { api } from '../services/api';
import { isSuperAdmin } from '../services/rbac';
import { getConfigSync } from '../services/config';

import { useAuth } from '../hooks/useAuth';

const QUICK_START_VERSION = '1.0';

export default function QuickStartWizard() {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [tasks, setTasks] = useState([
        { id: 'org', label: 'Organization Profile', path: '/settings', completed: false, icon: Settings },
        { id: 'doctors', label: 'Add Doctors', path: '/doctors', completed: false, icon: Stethoscope },
        { id: 'modalities', label: 'Add Modalities', path: '/modalities', completed: false, icon: Monitor },
        { id: 'procedures', label: 'Add Procedures', path: '/procedures', completed: false, icon: Activity },
        { id: 'nodes', label: 'Add DICOM Nodes', path: '/dicom-nodes', completed: false, icon: Network },
        { id: 'users', label: 'Add Users', path: '/users', completed: false, icon: UserPlus },
    ]);
    const [isLoading, setIsLoading] = useState(true);
    const [isVisible, setIsVisible] = useState(false);

    // Only show for admins. Hide for superadmin/developer unless enabled via env.
    const hasAccess = useMemo(() => {
        if (!currentUser) return false;
        const role = (currentUser.role || '').toLowerCase();
        const permissions = new Set(currentUser.permissions || []);
        
        // Check environment settings
        const isProd = import.meta.env.PROD;
        const showForAdmins = import.meta.env.VITE_SHOW_GUIDES_FOR_ADMINS === 'true';
        
        // Hide for superadmin or developer in production, or if not forced enabled
        if ((role === 'superadmin' || role === 'developer')) {
            // Show only if NOT production AND forced enabled via env
            if (!isProd && showForAdmins) {
                return true;
            }
            return false;
        }
        
        // Show for regular admin or users with '*' permission
        return role === 'admin' || permissions.has('*');
    }, [currentUser]);

    const checkCompletion = async () => {
        if (!hasAccess) return;

        try {
            setIsLoading(true);
            const { getCompanyProfile } = await import('../services/settingsService');
            const { getUsers } = await import('../services/userService');
            
            const [
                profile,
                doctors,
                modalities,
                procedures,
                nodes,
                usersResponse
            ] = await Promise.all([
                getCompanyProfile(),
                api.listDoctors(),
                api.listModalities(),
                api.listProcedures(),
                api.listDicomNodes(),
                getUsers({ limit: 10 }) // Check if any users exist besides current
            ]);

            const users = Array.isArray(usersResponse?.data || usersResponse?.users) 
                ? (usersResponse.data || usersResponse.users) 
                : [];

            const updatedTasks = [
                { 
                    id: 'org', 
                    label: 'Organization Profile', 
                    path: '/settings', 
                    completed: !!(profile?.name), 
                    icon: Settings 
                },
                { 
                    id: 'doctors', 
                    label: 'Add Doctors', 
                    path: '/doctors', 
                    completed: Array.isArray(doctors) && doctors.length > 0, 
                    icon: Stethoscope 
                },
                { 
                    id: 'modalities', 
                    label: 'Add Modalities', 
                    path: '/modalities', 
                    completed: Array.isArray(modalities) && modalities.length > 0, 
                    icon: Monitor 
                },
                { 
                    id: 'procedures', 
                    label: 'Add Procedures', 
                    path: '/procedures', 
                    completed: Array.isArray(procedures) && procedures.length > 0, 
                    icon: Activity 
                },
                { 
                    id: 'nodes', 
                    label: 'Add DICOM Nodes', 
                    path: '/dicom-nodes', 
                    completed: Array.isArray(nodes) && nodes.length > 0, 
                    icon: Network 
                },
                { 
                    id: 'users', 
                    label: 'Add Users', 
                    path: '/users', 
                    completed: users.length > 1, // At least one user besides the default admin
                    icon: UserPlus 
                },
            ];

            const allCompleted = updatedTasks.every(t => t.completed);
            
            // Sync individual task progress if it just became completed
            const { updateQuickStartProgress } = await import('../services/authService');
            for (const task of updatedTasks) {
                const prevTask = tasks.find(t => t.id === task.id);
                if (task.completed && (!prevTask || !prevTask.completed)) {
                    // This task just got completed, sync it!
                    try {
                        await updateQuickStartProgress(task.id, QUICK_START_VERSION);
                    } catch (err) {
                        console.error(`Failed to sync task ${task.id}:`, err);
                    }
                }
            }

            setTasks(updatedTasks);
            
            // Check if this version was already marked as completed in localStorage
            const storedCompletion = localStorage.getItem('quick_start_completed');
            let isAlreadyCompleted = false;
            if (storedCompletion) {
                try {
                    const parsed = JSON.parse(storedCompletion);
                    if (parsed.version === QUICK_START_VERSION && allCompleted) {
                        isAlreadyCompleted = true;
                    }
                } catch (e) {
                    console.error('Error parsing quick_start_completed', e);
                }
            }

            if (allCompleted && !isAlreadyCompleted) {
                // Save completion status
                localStorage.setItem('quick_start_completed', JSON.stringify({
                    version: QUICK_START_VERSION,
                    completedAt: new Date().toISOString()
                }));
                setIsVisible(false);
            } else if (!allCompleted) {
                setIsVisible(true);
            } else {
                // All completed and already marked so in storage
                setIsVisible(false);
            }
        } catch (error) {
            console.error('Error checking quick start completion:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        checkCompletion();
    }, [location.pathname, hasAccess]);

    if (!hasAccess || !isVisible) return null;

    const completedCount = tasks.filter(t => t.completed).length;
    const progressPercent = Math.round((completedCount / tasks.length) * 100);

    const toggleOpen = () => setIsOpen(!isOpen);

    // Draggable Logic - similar to AIChatBot but slightly offset
    // We'll use a simpler fixed position for now but ensure it's above the chat button
    // Chat button is usually at { bottom: 24, right: 24 }
    // We'll put this at { bottom: 90, right: 24 }
    
    return (
        <div className="fixed z-[45] right-6 bottom-[90px] flex flex-col items-end pointer-events-none">
            {/* Wizard Panel */}
            {isOpen && (
                <div className="mb-4 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden pointer-events-auto transition-all duration-300 animate-in slide-in-from-bottom-4">
                    <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Zap size={18} className="fill-white" />
                            <span className="font-bold text-sm">Quick Start Guide</span>
                        </div>
                        <button onClick={toggleOpen} className="hover:bg-white/20 p-1 rounded">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="p-4">
                        <div className="mb-4">
                            <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
                                <span>Progress Setup</span>
                                <span>{completedCount} / {tasks.length}</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div 
                                    className="bg-blue-600 h-full transition-all duration-500"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            {tasks.map((task) => (
                                <button
                                    key={task.id}
                                    onClick={() => {
                                        navigate(task.path);
                                        // On mobile or small screens we might want to close on nav
                                        if (window.innerWidth < 768) setIsOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors group ${
                                        task.completed 
                                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                                            : 'bg-slate-50 text-slate-700 hover:bg-blue-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-1.5 rounded-md ${
                                            task.completed ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-slate-400 border border-slate-200'
                                        }`}>
                                            <task.icon size={16} />
                                        </div>
                                        <span className={`text-sm font-medium ${task.completed ? '' : 'group-hover:text-blue-600'}`}>
                                            {task.label}
                                        </span>
                                    </div>
                                    {task.completed ? (
                                        <CheckCircle2 size={18} className="text-emerald-500" />
                                    ) : (
                                        <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-400" />
                                    )}
                                </button>
                            ))}
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-slate-100 text-[10px] text-slate-400 flex justify-between">
                            <span>Version {QUICK_START_VERSION}</span>
                            <span>Input data master untuk memulai</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Toggle Button */}
            <div className="pointer-events-auto">
                <button
                    onClick={toggleOpen}
                    className={`
                        flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95
                        ${isOpen 
                            ? 'bg-slate-800 text-white' 
                            : 'bg-white border border-blue-100 text-blue-600 hover:bg-blue-50'
                        }
                    `}
                >
                    <div className="relative">
                        <Zap size={18} className={isOpen ? 'fill-blue-400 text-blue-400' : 'fill-blue-600'} />
                        {!isOpen && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full animate-pulse" />
                        )}
                    </div>
                    <span className="text-sm font-bold">
                        {isOpen ? 'Close Guide' : `Setup Progress (${completedCount}/${tasks.length})`}
                    </span>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>
            </div>
        </div>
    );
}
