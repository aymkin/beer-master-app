import React, { useState, useEffect, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import {
  Beer,
  Package,
  ArrowRightLeft,
  MessageSquare,
  BarChart3,
  Database,
  FileSpreadsheet,
  RefreshCw,
  Send,
  Plus,
  Minus,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Droplet,
  FileText,
  Copy,
  ExternalLink,
  Search,
  Bell,
  Factory,
  Beaker,
  Mail,
  Calendar as CalendarIcon,
  Menu,
  X,
  Lock,
  User,
  Building,
  LogOut,
  CheckSquare,
  Shield,
  Users,
  Trash2,
  Edit,
  Save,
  Clock,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  UserPlus,
  Sun,
  Moon,
  Briefcase,
  Download
} from "lucide-react";

// --- Types ---

type Category = "Сырье" | "Готовая продукция";
type UserRole = "admin" | "brewer" | "assistant" | "tester";

interface InventoryItem {
  id: string;
  name: string;
  category: Category;
  quantity: number;
  unit: string;
  minLevel: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  action: string;
  details: string;
}

interface Message {
  role: "user" | "model";
  text: string;
  isThinking?: boolean;
}

interface Ingredient {
  itemId: string;
  amount: number;
}

interface Recipe {
  id: string;
  name: string;
  outputItemId: string;
  outputAmount: number;
  ingredients: Ingredient[];
}

interface ScheduledBrew {
  id: string;
  date: string; // ISO Date string YYYY-MM-DD
  recipeId: string;
  status: "planned" | "completed";
}

interface WorkShift {
    id: string;
    date: string;
    username: string;
    type: "day" | "night";
}

interface Notification {
  id: string;
  message: string;
  type: "warning" | "info" | "success";
  read: boolean;
  timestamp: string;
}

interface Task {
    id: string;
    text: string;
    completed: boolean;
    priority: "high" | "normal";
}

interface UserAccount {
    username: string;
    password: string;
    role: UserRole;
}

// PWA Install Event Interface
interface BeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// --- Initial Data ---

const INITIAL_INVENTORY: InventoryItem[] = [
  { id: "rm-1", name: "Солод Pilsner", category: "Сырье", quantity: 1250, unit: "кг", minLevel: 500 },
  { id: "rm-2", name: "Хмель Citra", category: "Сырье", quantity: 45, unit: "кг", minLevel: 10 },
  { id: "rm-3", name: "Хмель Mosaic", category: "Сырье", quantity: 12, unit: "кг", minLevel: 10 },
  { id: "rm-4", name: "Дрожжи US-05", category: "Сырье", quantity: 5, unit: "кг", minLevel: 1 },
  { id: "rm-5", name: "Солод Munich", category: "Сырье", quantity: 300, unit: "кг", minLevel: 100 },
  { id: "fg-1", name: "Hazy IPA", category: "Готовая продукция", quantity: 1200, unit: "кг", minLevel: 200 },
  { id: "fg-2", name: "Stout", category: "Готовая продукция", quantity: 450, unit: "кг", minLevel: 100 },
];

const INITIAL_RECIPES: Recipe[] = [
  {
    id: "rec-1",
    name: "Варка Hazy IPA (500л)",
    outputItemId: "fg-1",
    outputAmount: 500,
    ingredients: [
      { itemId: "rm-1", amount: 100 },
      { itemId: "rm-2", amount: 5 },
      { itemId: "rm-3", amount: 2 },
      { itemId: "rm-4", amount: 0.5 },
    ]
  },
  {
    id: "rec-2",
    name: "Варка Stout (500л)",
    outputItemId: "fg-2",
    outputAmount: 500,
    ingredients: [
      { itemId: "rm-1", amount: 80 },
      { itemId: "rm-5", amount: 20 },
      { itemId: "rm-2", amount: 2 },
      { itemId: "rm-4", amount: 0.5 },
    ]
  }
];

const INITIAL_TASKS: Task[] = [
    { id: "t-1", text: "Проверить температуру в ЦКТ №4", completed: false, priority: "high" },
    { id: "t-2", text: "Принять поставку солода от поставщика", completed: true, priority: "normal" },
    { id: "t-3", text: "Взять пробы сусла на плотность", completed: false, priority: "normal" },
    { id: "t-4", text: "Санитарная обработка линии розлива", completed: false, priority: "high" },
];

// --- Helper Hook for Local Storage with Error Handling ---
function useStickyState<T>(defaultValue: T, key: string): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stickyValue = window.localStorage.getItem(key);
      return stickyValue !== null ? JSON.parse(stickyValue) : defaultValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Error writing localStorage key "${key}":`, error);
    }
  }, [key, value]);

  return [value, setValue];
}

// --- AI Configuration ---
const updateInventoryTool: FunctionDeclaration = {
  name: "updateInventory",
  description: "Обновляет количество товара на складе. Используйте положительные числа для поступления, отрицательные для расхода.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      itemName: {
        type: Type.STRING,
        description: "Название товара (например, 'Солод Pilsner', 'Hazy IPA')."
      },
      quantityChange: {
        type: Type.NUMBER,
        description: "Количество для добавления или вычитания."
      },
      reason: {
        type: Type.STRING,
        description: "Причина обновления (например, 'Пришла поставка', 'Варка №44', 'Продажа дистрибьютору')."
      }
    },
    required: ["itemName", "quantityChange", "reason"]
  }
};

const getInventoryTool: FunctionDeclaration = {
  name: "getInventory",
  description: "Возвращает текущий список товаров на складе.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  }
};

// --- Notification Component ---
interface NotificationBellProps {
    notifications: Notification[];
    onClear: () => void;
}

const NotificationBell = ({ notifications, onClear }: NotificationBellProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <div className="relative" ref={wrapperRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="relative p-2 rounded-full hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
            >
                <Bell className="w-6 h-6" />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full border-2 border-gray-900 flex items-center justify-center text-[10px] font-bold text-white">
                        {unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="p-3 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center">
                        <span className="font-semibold text-sm text-white">Уведомления</span>
                        <button onClick={onClear} className="text-xs text-blue-400 hover:text-blue-300">
                            Очистить
                        </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-4 text-center text-gray-500 text-xs">Нет новых уведомлений</div>
                        ) : (
                            notifications.map(note => (
                                <div key={note.id} className="p-3 border-b border-gray-700 last:border-0 hover:bg-gray-700/50 transition-colors">
                                    <div className="flex gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                                        <div>
                                            <p className="text-sm text-gray-200">{note.message}</p>
                                            <span className="text-[10px] text-gray-500">
                                                {new Date(note.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Inventory Action Buttons Component ---
interface InventoryActionButtonsProps {
    item: InventoryItem;
    currentUser: UserAccount;
    onUpdateInventory: (name: string, change: number, reason: string) => void;
    onOpenManualModal: (config: any) => void;
    onDelete: (id: string) => void;
}

const InventoryActionButtons = ({ item, currentUser, onUpdateInventory, onOpenManualModal, onDelete }: InventoryActionButtonsProps) => {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPress = useRef(false);

    const startPress = (type: 'add' | 'subtract') => {
        isLongPress.current = false;
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            onOpenManualModal({
                isOpen: true,
                itemId: item.id,
                type: type,
                itemName: item.name
            });
        }, 1500); // Reduced to 1.5s for better UX
    };

    const endPress = (type: 'add' | 'subtract') => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        
        if (!isLongPress.current) {
            const change = type === 'add' ? 1 : -1;
            onUpdateInventory(item.name, change, "Быстрое изменение");
        }
    };

    return (
        <div className="flex items-center justify-end gap-2">
             <button 
                onMouseDown={() => startPress('add')}
                onMouseUp={() => endPress('add')}
                onMouseLeave={() => { if(timerRef.current) clearTimeout(timerRef.current); }}
                onTouchStart={() => startPress('add')}
                onTouchEnd={(e) => { e.preventDefault(); endPress('add'); }}
                className="p-1 hover:bg-gray-600 rounded text-green-400 disabled:opacity-30 disabled:hover:bg-transparent transition-colors active:scale-95" 
                title="Добавить 1 кг (Удерживайте для ввода)"
                disabled={currentUser.role === 'tester'}
             >
                <Plus className="w-5 h-5 md:w-4 md:h-4" />
             </button>
             <button 
                onMouseDown={() => startPress('subtract')}
                onMouseUp={() => endPress('subtract')}
                onMouseLeave={() => { if(timerRef.current) clearTimeout(timerRef.current); }}
                onTouchStart={() => startPress('subtract')}
                onTouchEnd={(e) => { e.preventDefault(); endPress('subtract'); }}
                className="p-1 hover:bg-gray-600 rounded text-red-400 disabled:opacity-30 disabled:hover:bg-transparent transition-colors active:scale-95" 
                title="Списать 1 кг (Удерживайте для ввода)"
                disabled={currentUser.role === 'tester'}
             >
                <Minus className="w-5 h-5 md:w-4 md:h-4" />
             </button>
             {(currentUser.role === 'admin' || currentUser.role === 'brewer') && (
                <button
                    onClick={() => onDelete(item.id)}
                    className="p-1 hover:bg-gray-600 rounded text-gray-500 hover:text-red-400 ml-2"
                    title="Удалить позицию"
                >
                    <Trash2 className="w-5 h-5 md:w-4 md:h-4" />
                </button>
             )}
        </div>
    );
};

// --- Main Application Component (Authenticated) ---

const BreweryApp = ({ breweryName, currentUser, onLogout }: { breweryName: string, currentUser: UserAccount, onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState<"dashboard" | "inventory" | "production" | "ai" | "integrations" | "employees">("dashboard");
  const [productionView, setProductionView] = useState<"recipes" | "schedule">("recipes");
  
  // Persistent State (Scoped to Brewery)
  const [inventory, setInventory] = useStickyState<InventoryItem[]>(INITIAL_INVENTORY, `${breweryName}_inventory`);
  const [recipes, setRecipes] = useStickyState<Recipe[]>(INITIAL_RECIPES, `${breweryName}_recipes`);
  const [logs, setLogs] = useStickyState<LogEntry[]>([], `${breweryName}_logs`);
  const [tasks, setTasks] = useStickyState<Task[]>(INITIAL_TASKS, `${breweryName}_tasks`);
  const [scheduledBrews, setScheduledBrews] = useStickyState<ScheduledBrew[]>([], `${breweryName}_schedule`);
  const [workShifts, setWorkShifts] = useStickyState<WorkShift[]>([], `${breweryName}_shifts`);
  // Users state is needed for Admin to manage employees
  const [users, setUsers] = useStickyState<UserAccount[]>([], `${breweryName}_users`);

  const [newTaskText, setNewTaskText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Mobile Menu
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateForEvent, setSelectedDateForEvent] = useState<string | null>(null);
  // MOVED UP: State for calendar modal tab to avoid conditional hook violation
  const [scheduleModalTab, setScheduleModalTab] = useState<'brew' | 'shift'>('brew');

  // PWA Install State
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // --- Modal States ---
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [newInventoryItem, setNewInventoryItem] = useState<Partial<InventoryItem>>({ category: "Сырье", unit: "кг", minLevel: 0, quantity: 0 });

  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Partial<Recipe> | null>(null);
  
  // Employee Modal
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState<UserAccount>({ username: "", password: "", role: "assistant" });

  // Manual Input Modal State
  const [manualInputModal, setManualInputModal] = useState<{ 
      isOpen: boolean, 
      itemId: string | null, 
      type: 'add' | 'subtract' | 'set', 
      itemName: string,
      currentValue?: number
  }>({ 
      isOpen: false, itemId: null, type: 'add', itemName: '' 
  });
  const [manualValue, setManualValue] = useState<string>("");

  // AI State
  const [messages, setMessages] = useState<Message[]>([
    { role: "model", text: "Здравствуйте! Я AI-помощник пивовара. Я помогу управлять запасами. Вы можете написать мне, например: 'Привезли 50 кг солода' или 'Разлили 500 кг стаута'." }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Effects ---

  // PWA Install Handler
  useEffect(() => {
    const handler = (e: Event) => {
        e.preventDefault();
        setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
        setInstallPrompt(null);
    }
  };

  // Calculate Reserved Inventory
  const reservedInventory = useMemo(() => {
    const map: Record<string, number> = {};
    scheduledBrews.forEach(brew => {
        if (brew.status === 'planned') {
            const recipe = recipes.find(r => r.id === brew.recipeId);
            if (recipe) {
                recipe.ingredients.forEach(ing => {
                    map[ing.itemId] = (map[ing.itemId] || 0) + ing.amount;
                });
            }
        }
    });
    return map;
  }, [scheduledBrews, recipes]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check for low stock alerts
  useEffect(() => {
    const lowStockItems = inventory.filter(i => {
        const reserved = reservedInventory[i.id] || 0;
        const available = i.quantity - reserved;
        return available <= i.minLevel;
    });
    
    const alerts: Notification[] = lowStockItems.map(item => ({
        id: `alert-${item.id}-${Date.now()}`,
        message: `Низкий доступный остаток: ${item.name} (Доступно: ${item.quantity - (reservedInventory[item.id] || 0)} ${item.unit})`,
        type: "warning",
        read: false,
        timestamp: new Date().toISOString()
    }));
    
    if (alerts.length > 0) {
       const newAlerts = alerts.filter(a => !notifications.some(n => n.message === a.message));
       if (newAlerts.length > 0) {
           setNotifications(prev => [...newAlerts, ...prev]);
       }
    }
  }, [inventory, reservedInventory]);

  // --- Logic ---

  const handleUpdateInventory = (itemName: string, change: number, reason: string): string => {
    // All roles (Admin, Brewer, Assistant) can update inventory counts
    let itemFound = false;
    let newInventory = inventory.map(item => {
      if (item.name.toLowerCase() === itemName.toLowerCase() || item.name.toLowerCase().includes(itemName.toLowerCase())) {
        itemFound = true;
        const newQuantity = Math.max(0, Number((item.quantity + change).toFixed(2))); 
        return { ...item, quantity: newQuantity };
      }
      return item;
    });

    if (!itemFound) {
      return `Ошибка: Товар '${itemName}' не найден. Пожалуйста, проверьте название.`;
    }

    setInventory(newInventory);
    
    const newLog: LogEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      action: change > 0 ? "ПРИХОД" : change < 0 ? "РАСХОД" : "КОРРЕКЦИЯ",
      details: `${itemName}: ${change > 0 ? '+' : ''}${change} (${reason}) - ${currentUser.username}`
    };
    setLogs(prev => [newLog, ...prev]);

    return `Успешно: Обновлено ${itemName} на ${change}. Причина: ${reason}.`;
  };

  // --- Inventory Management Logic ---
  const handleAddInventoryItem = () => {
      if (!newInventoryItem.name) return;
      const newItem: InventoryItem = {
          id: `item-${Date.now()}`,
          name: newInventoryItem.name,
          category: newInventoryItem.category as Category,
          quantity: Number(newInventoryItem.quantity) || 0,
          unit: "кг",
          minLevel: Number(newInventoryItem.minLevel) || 0
      };
      setInventory([...inventory, newItem]);
      setIsInventoryModalOpen(false);
      setNewInventoryItem({ category: "Сырье", unit: "кг", minLevel: 0, quantity: 0 });
  };

  const handleDeleteInventoryItem = (id: string) => {
      if (confirm("Вы уверены, что хотите удалить эту позицию?")) {
          setInventory(inventory.filter(i => i.id !== id));
      }
  };

  // --- Recipe Management Logic ---
  const handleSaveRecipe = () => {
      if (!editingRecipe || !editingRecipe.name || !editingRecipe.outputItemId) {
          alert("Пожалуйста, заполните основные поля");
          return;
      }
      
      const newRecipe: Recipe = {
          id: editingRecipe.id || `rec-${Date.now()}`,
          name: editingRecipe.name,
          outputItemId: editingRecipe.outputItemId,
          outputAmount: Number(editingRecipe.outputAmount) || 0,
          ingredients: editingRecipe.ingredients || []
      };

      if (editingRecipe.id) {
          setRecipes(recipes.map(r => r.id === editingRecipe.id ? newRecipe : r));
      } else {
          setRecipes([...recipes, newRecipe]);
      }
      setIsRecipeModalOpen(false);
      setEditingRecipe(null);
  };

  const handleDeleteRecipe = (id: string) => {
      if (confirm("Удалить эту технологическую карту?")) {
          setRecipes(recipes.filter(r => r.id !== id));
      }
  };

  const handleBrew = (recipe: Recipe, scheduledBrewId?: string) => {
    // Admin, Brewer, and Assistant can execute brews
    const missingIngredients: string[] = [];
    recipe.ingredients.forEach(ing => {
        const stockItem = inventory.find(i => i.id === ing.itemId);
        if (!stockItem || stockItem.quantity < ing.amount) {
            missingIngredients.push(stockItem ? stockItem.name : "Неизвестный компонент");
        }
    });

    if (missingIngredients.length > 0) {
        alert(`Ошибка! Недостаточно ингредиентов на складе: ${missingIngredients.join(", ")}`);
        return;
    }

    const newInventory = inventory.map(item => {
        const isIngredient = recipe.ingredients.find(ing => ing.itemId === item.id);
        if (isIngredient) {
            return { ...item, quantity: Number((item.quantity - isIngredient.amount).toFixed(2)) };
        }
        if (item.id === recipe.outputItemId) {
            return { ...item, quantity: Number((item.quantity + recipe.outputAmount).toFixed(2)) };
        }
        return item;
    });

    setInventory(newInventory);

    // If it was a scheduled brew, mark as completed (removes reservation)
    if (scheduledBrewId) {
        setScheduledBrews(prev => prev.map(sb => 
            sb.id === scheduledBrewId ? { ...sb, status: 'completed' } : sb
        ));
    }

    const newLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        action: "ПРОИЗВОДСТВО",
        details: `Сварено ${recipe.outputAmount}л ${recipe.name}. (${currentUser.username})`
    };
    setLogs(prev => [newLog, ...prev]);
    
    setNotifications(prev => [{
        id: Date.now().toString(),
        message: `Производство завершено: ${recipe.name}`,
        type: "success",
        read: false,
        timestamp: new Date().toISOString()
    }, ...prev]);
  };

  // --- Calendar Logic (Brews & Shifts) ---
  const handleScheduleBrew = (recipeId: string) => {
    if (!selectedDateForEvent) return;
    
    const newBrew: ScheduledBrew = {
        id: `brew-${Date.now()}`,
        date: selectedDateForEvent,
        recipeId: recipeId,
        status: "planned"
    };
    setScheduledBrews([...scheduledBrews, newBrew]);
    setSelectedDateForEvent(null);
  };

  const handleDeleteScheduledBrew = (brewId: string) => {
      if(confirm("Удалить запланированную варку? Резерв сырья будет снят.")) {
          setScheduledBrews(scheduledBrews.filter(b => b.id !== brewId));
      }
  };

  const handleScheduleShift = (username: string, type: "day" | "night") => {
      if (!selectedDateForEvent) return;
      if (workShifts.some(s => s.date === selectedDateForEvent && s.username === username)) {
          alert("Этот сотрудник уже работает в этот день.");
          return;
      }

      const newShift: WorkShift = {
          id: `shift-${Date.now()}`,
          date: selectedDateForEvent,
          username: username,
          type: type
      };
      setWorkShifts([...workShifts, newShift]);
      // Keep modal open to add more or close it
      setSelectedDateForEvent(null); 
  };

  const handleDeleteShift = (shiftId: string) => {
      if(confirm("Удалить смену сотрудника?")) {
          setWorkShifts(workShifts.filter(s => s.id !== shiftId));
      }
  };

  const toggleTask = (id: string) => {
      setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const addTask = () => {
      if (!newTaskText.trim()) return;
      const newTask: Task = {
          id: Date.now().toString(),
          text: newTaskText,
          completed: false,
          priority: "normal"
      };
      setTasks([newTask, ...tasks]);
      setNewTaskText("");
  };

  const deleteTask = (id: string) => {
      if (currentUser.role === 'assistant' || currentUser.role === 'tester') return;
      setTasks(tasks.filter(t => t.id !== id));
  };

  // --- Employee Management Logic ---
  const handleAddEmployee = () => {
      if(!newEmployee.username || !newEmployee.password) return;
      if(users.some(u => u.username === newEmployee.username)) {
          alert("Пользователь с таким именем уже существует");
          return;
      }
      setUsers([...users, newEmployee]);
      setIsEmployeeModalOpen(false);
      setNewEmployee({ username: "", password: "", role: "assistant" });
  };

  const handleDeleteEmployee = (username: string) => {
      if(username === currentUser.username) {
          alert("Нельзя удалить самого себя");
          return;
      }
      if(confirm(`Удалить сотрудника ${username}?`)) {
          setUsers(users.filter(u => u.username !== username));
      }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMsg = inputMessage;
    setInputMessage("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setIsProcessing(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
            ...messages.slice(-6).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
            { role: "user", parts: [{ text: userMsg }] }
        ],
        config: {
          tools: [{ functionDeclarations: [updateInventoryTool, getInventoryTool] }],
          systemInstruction: "Вы — менеджер склада пивоварни. Общайтесь только на русском языке. Будьте кратким и профессиональным. Все веса измеряются в кг. При обновлении запасов подтверждайте новый остаток.",
        }
      });

      const functionCalls = response.candidates?.[0]?.content?.parts?.[0]?.functionCall 
                          ? [response.candidates[0].content.parts[0].functionCall] 
                          : response.functionCalls;

      let finalResponseText = response.text || "";

      if (functionCalls && functionCalls.length > 0) {
         for (const call of functionCalls) {
            let resultString = "";
            if (call.name === "updateInventory") {
                const { itemName, quantityChange, reason } = call.args as any;
                resultString = handleUpdateInventory(itemName, quantityChange, reason);
            } else if (call.name === "getInventory") {
                resultString = JSON.stringify(inventory.map(i => `${i.name}: ${i.quantity} ${i.unit}`));
            }

            const toolResponse = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [
                    { role: "user", parts: [{ text: userMsg }] },
                    { role: "model", parts: [{ functionCall: call }] },
                    { role: "function", parts: [{ functionResponse: { name: call.name, response: { result: resultString } } }] }
                ]
            });
            
            finalResponseText = toolResponse.text || "Склад обновлен.";
         }
      }

      setMessages(prev => [...prev, { role: "model", text: finalResponseText }]);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: "model", text: "Извините, произошла ошибка при обработке запроса." }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Render Functions ---

  const renderInventoryModal = () => (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md p-6">
              <h3 className="text-xl font-bold text-white mb-4">Добавить позицию</h3>
              <div className="space-y-4">
                  <div>
                      <label className="block text-xs text-gray-400 mb-1">Название</label>
                      <input 
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" 
                        value={newInventoryItem.name || ""}
                        onChange={e => setNewInventoryItem({...newInventoryItem, name: e.target.value})}
                        placeholder="Например: Солод Pale Ale"
                      />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Категория</label>
                        <select 
                            className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                            value={newInventoryItem.category}
                            onChange={e => setNewInventoryItem({...newInventoryItem, category: e.target.value as Category})}
                        >
                            <option value="Сырье">Сырье</option>
                            <option value="Готовая продукция">Готовая продукция</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Ед. измерения</label>
                        <input 
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-gray-400 cursor-not-allowed"
                            value="кг"
                            disabled
                        />
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Нач. остаток (кг)</label>
                        <input 
                            type="number"
                            step="0.1"
                            className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                            value={newInventoryItem.quantity}
                            onChange={e => setNewInventoryItem({...newInventoryItem, quantity: Number(e.target.value)})}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Мин. уровень (кг)</label>
                        <input 
                            type="number"
                            step="0.1"
                            className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                            value={newInventoryItem.minLevel}
                            onChange={e => setNewInventoryItem({...newInventoryItem, minLevel: Number(e.target.value)})}
                        />
                      </div>
                  </div>
              </div>
              <div className="flex gap-3 mt-6">
                  <button 
                    onClick={() => setIsInventoryModalOpen(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded transition-colors"
                  >
                      Отмена
                  </button>
                  <button 
                    onClick={handleAddInventoryItem}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded transition-colors"
                  >
                      Добавить
                  </button>
              </div>
          </div>
      </div>
  );

  const renderEmployeeModal = () => (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md p-6">
              <h3 className="text-xl font-bold text-white mb-4">Добавить сотрудника</h3>
              <div className="space-y-4">
                  <div>
                      <label className="block text-xs text-gray-400 mb-1">Имя пользователя</label>
                      <input 
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" 
                        value={newEmployee.username}
                        onChange={e => setNewEmployee({...newEmployee, username: e.target.value})}
                      />
                  </div>
                  <div>
                      <label className="block text-xs text-gray-400 mb-1">Пароль</label>
                      <input 
                        type="password"
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" 
                        value={newEmployee.password}
                        onChange={e => setNewEmployee({...newEmployee, password: e.target.value})}
                      />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Должность</label>
                    <select 
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                        value={newEmployee.role}
                        onChange={e => setNewEmployee({...newEmployee, role: e.target.value as UserRole})}
                    >
                        <option value="admin">Администратор</option>
                        <option value="brewer">Пивовар</option>
                        <option value="assistant">Помощник пивовара</option>
                        <option value="tester">Тестер</option>
                    </select>
                  </div>
              </div>
              <div className="flex gap-3 mt-6">
                  <button 
                    onClick={() => setIsEmployeeModalOpen(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded transition-colors"
                  >
                      Отмена
                  </button>
                  <button 
                    onClick={handleAddEmployee}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-white py-2 rounded transition-colors"
                  >
                      Создать
                  </button>
              </div>
          </div>
      </div>
  );

  const renderManualInputModal = () => {
    if (!manualInputModal.isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
             <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-sm p-6">
                <h3 className="text-xl font-bold text-white mb-2">
                    {manualInputModal.type === 'add' ? 'Поступление' : manualInputModal.type === 'subtract' ? 'Списание' : 'Корректировка остатка'}
                </h3>
                <p className="text-gray-400 text-sm mb-4">{manualInputModal.itemName}</p>
                
                <div className="relative mb-6">
                    <input 
                        type="number" 
                        step="0.1"
                        autoFocus
                        value={manualValue}
                        onChange={(e) => setManualValue(e.target.value)}
                        placeholder="0.0"
                        className="w-full bg-gray-900 border border-gray-700 text-3xl font-mono text-center text-white rounded-lg p-4 focus:border-blue-500 focus:outline-none"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">кг</span>
                </div>

                <div className="flex gap-3">
                    <button 
                        onClick={() => {
                            setManualInputModal({ ...manualInputModal, isOpen: false });
                            setManualValue("");
                        }}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg"
                    >
                        Отмена
                    </button>
                    <button 
                         onClick={() => {
                            const val = parseFloat(manualValue);
                            if (!isNaN(val) && manualInputModal.itemId) {
                                let change = 0;
                                let reason = "";
                                if (manualInputModal.type === 'set') {
                                    // Calculate difference
                                    const current = manualInputModal.currentValue || 0;
                                    change = val - current;
                                    reason = "Инвентаризация / Коррекция";
                                } else {
                                    change = manualInputModal.type === 'add' ? val : -val;
                                    reason = "Ручной ввод (точное значение)";
                                }
                                
                                if (change !== 0) {
                                    handleUpdateInventory(manualInputModal.itemName, change, reason);
                                }
                                setManualInputModal({ ...manualInputModal, isOpen: false });
                                setManualValue("");
                            }
                        }}
                        className={`flex-1 text-white py-3 rounded-lg font-bold ${
                            manualInputModal.type === 'add' ? 'bg-green-600 hover:bg-green-500' : 
                            manualInputModal.type === 'subtract' ? 'bg-red-600 hover:bg-red-500' :
                            'bg-blue-600 hover:bg-blue-500'
                        }`}
                    >
                        Подтвердить
                    </button>
                </div>
             </div>
        </div>
    )
  }

  const renderRecipeModal = () => {
    if (!editingRecipe) return null;

    const availableProducts = inventory.filter(i => i.category === "Готовая продукция");
    const availableIngredients = inventory.filter(i => i.category === "Сырье");

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-white mb-4">
                  {editingRecipe.id ? "Редактировать карту" : "Новая технологическая карта"}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                      <label className="block text-xs text-gray-400 mb-1">Название карты</label>
                      <input 
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                        value={editingRecipe.name || ""}
                        onChange={e => setEditingRecipe({...editingRecipe, name: e.target.value})}
                      />
                  </div>
                  <div>
                       <label className="block text-xs text-gray-400 mb-1">Выход продукции (кг)</label>
                       <input 
                        type="number"
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                        value={editingRecipe.outputAmount || 0}
                        onChange={e => setEditingRecipe({...editingRecipe, outputAmount: Number(e.target.value)})}
                      />
                  </div>
                  <div className="md:col-span-2">
                       <label className="block text-xs text-gray-400 mb-1">Производимый продукт</label>
                       <select 
                            className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                            value={editingRecipe.outputItemId || ""}
                            onChange={e => setEditingRecipe({...editingRecipe, outputItemId: e.target.value})}
                       >
                           <option value="">Выберите продукт...</option>
                           {availableProducts.map(p => (
                               <option key={p.id} value={p.id}>{p.name}</option>
                           ))}
                       </select>
                  </div>
              </div>

              <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                      <h4 className="font-semibold text-gray-300 text-sm">Ингредиенты</h4>
                      <button 
                        onClick={() => setEditingRecipe({
                            ...editingRecipe, 
                            ingredients: [...(editingRecipe.ingredients || []), { itemId: "", amount: 0 }]
                        })}
                        className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-white flex items-center gap-1"
                      >
                          <Plus className="w-3 h-3" /> Добавить компонент
                      </button>
                  </div>
                  <div className="space-y-2 bg-gray-900/50 p-4 rounded border border-gray-700/50">
                      {(editingRecipe.ingredients || []).map((ing, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                              <select 
                                className="flex-1 bg-gray-800 border border-gray-700 rounded p-1 text-sm text-white"
                                value={ing.itemId}
                                onChange={e => {
                                    const newIngs = [...(editingRecipe.ingredients || [])];
                                    newIngs[idx].itemId = e.target.value;
                                    setEditingRecipe({...editingRecipe, ingredients: newIngs});
                                }}
                              >
                                  <option value="">Выберите сырье...</option>
                                  {availableIngredients.map(i => (
                                      <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                                  ))}
                              </select>
                              <input 
                                type="number"
                                step="0.001"
                                className="w-20 bg-gray-800 border border-gray-700 rounded p-1 text-sm text-white"
                                placeholder="Кол-во"
                                value={ing.amount}
                                onChange={e => {
                                    const newIngs = [...(editingRecipe.ingredients || [])];
                                    newIngs[idx].amount = Number(e.target.value);
                                    setEditingRecipe({...editingRecipe, ingredients: newIngs});
                                }}
                              />
                              <button 
                                onClick={() => {
                                    const newIngs = [...(editingRecipe.ingredients || [])];
                                    newIngs.splice(idx, 1);
                                    setEditingRecipe({...editingRecipe, ingredients: newIngs});
                                }}
                                className="p-1 text-gray-500 hover:text-red-400"
                              >
                                  <Trash2 className="w-4 h-4" />
                              </button>
                          </div>
                      ))}
                      {(editingRecipe.ingredients || []).length === 0 && (
                          <p className="text-gray-500 text-xs italic text-center">Нет ингредиентов</p>
                      )}
                  </div>
              </div>

              <div className="flex gap-3 mt-6">
                  <button 
                    onClick={() => { setIsRecipeModalOpen(false); setEditingRecipe(null); }}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded transition-colors"
                  >
                      Отмена
                  </button>
                  <button 
                    onClick={handleSaveRecipe}
                    className="flex-1 bg-purple-600 hover:bg-purple-500 text-white py-2 rounded transition-colors flex items-center justify-center gap-2"
                  >
                      <Save className="w-4 h-4" /> Сохранить
                  </button>
              </div>
          </div>
      </div>
    );
  };

  const renderInventory = () => {
    const filteredInventory = inventory.filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 mb-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input 
                        type="text" 
                        placeholder="Поиск по названию или категории..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                </div>
                {(currentUser.role === 'admin' || currentUser.role === 'brewer') && (
                    <button 
                        onClick={() => setIsInventoryModalOpen(true)}
                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium whitespace-nowrap"
                    >
                        <Plus className="w-4 h-4" /> Добавить позицию
                    </button>
                )}
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-full">
                <thead>
                    <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wider">
                        <th className="p-4 font-semibold">Название</th>
                        <th className="p-4 font-semibold hidden md:table-cell">Категория</th>
                        <th className="p-4 font-semibold text-center">Всего</th>
                        <th className="p-4 font-semibold text-center text-amber-500">Резерв</th>
                        <th className="p-4 font-semibold text-center text-green-500">Доступно</th>
                        <th className="p-4 font-semibold text-right">Действия</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                    {filteredInventory.map((item) => {
                        const reserved = reservedInventory[item.id] || 0;
                        const available = Math.max(0, item.quantity - reserved);
                        
                        return (
                        <tr key={item.id} className="hover:bg-gray-700/50 transition-colors">
                            <td className="p-4 text-white font-medium">
                                {item.name}
                                <div className="md:hidden text-xs text-gray-500 mt-1">{item.category}</div>
                            </td>
                            <td className="p-4 hidden md:table-cell">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.category === 'Сырье' ? 'bg-amber-900/30 text-amber-300' : 'bg-blue-900/30 text-blue-300'}`}>
                                    {item.category}
                                </span>
                            </td>
                            <td className="p-4 text-center">
                                <span 
                                    onClick={() => {
                                        // Everyone except tester might need permission logic, but sticking to existing logic + Assistant
                                        if (currentUser.role !== 'tester') {
                                            setManualInputModal({
                                                isOpen: true,
                                                itemId: item.id,
                                                type: 'set',
                                                itemName: item.name,
                                                currentValue: item.quantity
                                            });
                                            setManualValue(item.quantity.toString());
                                        }
                                    }}
                                    className={`font-bold ${currentUser.role !== 'tester' ? 'cursor-pointer hover:underline decoration-dashed underline-offset-4' : ''} text-gray-200`}
                                >
                                {item.quantity.toLocaleString()}
                                </span>
                            </td>
                            <td className="p-4 text-center">
                                {reserved > 0 ? (
                                    <span className="text-amber-400 font-bold">{reserved.toLocaleString()}</span>
                                ) : (
                                    <span className="text-gray-600">-</span>
                                )}
                            </td>
                             <td className="p-4 text-center">
                                <span className={`font-bold ${available <= item.minLevel ? 'text-red-400' : 'text-green-400'}`}>
                                    {available.toLocaleString()}
                                </span>
                                <span className="text-gray-500 text-xs ml-1">{item.unit}</span>
                            </td>
                            <td className="p-4 text-right">
                                <InventoryActionButtons 
                                    item={item} 
                                    currentUser={currentUser}
                                    onUpdateInventory={handleUpdateInventory}
                                    onOpenManualModal={setManualInputModal}
                                    onDelete={handleDeleteInventoryItem}
                                />
                            </td>
                        </tr>
                    )})}
                </tbody>
                </table>
            </div>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">
                Колонки: Всего = физический остаток, Резерв = запланированные варки, Доступно = для новых задач
            </p>
        </div>
    );
  };

  const renderSchedule = () => {
      const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
      const getFirstDayOfMonth = (year: number, month: number) => {
          const day = new Date(year, month, 1).getDay();
          return day === 0 ? 6 : day - 1; 
      };

      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const daysInMonth = getDaysInMonth(year, month);
      const firstDay = getFirstDayOfMonth(year, month);
      
      const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
      
      const days = [];
      for (let i = 0; i < firstDay; i++) days.push(null);
      for (let i = 1; i <= daysInMonth; i++) days.push(i);

      return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <CalendarDays className="w-6 h-6 text-purple-500" />
                    {monthNames[month]} {year}
                </h3>
                <div className="flex gap-2">
                    <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white"><ChevronLeft className="w-5 h-5" /></button>
                    <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white"><ChevronRight className="w-5 h-5" /></button>
                </div>
            </div>

            <div className="grid grid-cols-7 gap-1 md:gap-4 text-center text-gray-400 mb-2">
                <div>Пн</div><div>Вт</div><div>Ср</div><div>Чт</div><div>Пт</div><div>Сб</div><div>Вс</div>
            </div>
            <div className="grid grid-cols-7 gap-1 md:gap-4">
                {days.map((day, idx) => {
                    if (day === null) return <div key={`empty-${idx}`} className="h-32 md:h-40 bg-transparent"></div>;
                    
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayBrews = scheduledBrews.filter(b => b.date === dateStr);
                    const dayShifts = workShifts.filter(s => s.date === dateStr);
                    const isToday = new Date().toISOString().slice(0, 10) === dateStr;

                    return (
                        <div 
                            key={day} 
                            onClick={() => { if(currentUser.role !== 'assistant' && currentUser.role !== 'tester') setSelectedDateForEvent(dateStr); }}
                            className={`h-32 md:h-40 bg-gray-800 border ${isToday ? 'border-amber-500 bg-gray-800/80' : 'border-gray-700'} rounded-lg p-2 flex flex-col items-start justify-start hover:bg-gray-700/50 cursor-pointer overflow-hidden relative`}
                        >
                            <span className={`text-sm font-bold mb-1 ${isToday ? 'text-amber-500' : 'text-gray-300'}`}>{day}</span>
                            
                            <div className="w-full flex-1 overflow-y-auto space-y-1 scrollbar-hide">
                                {/* Brews */}
                                {dayBrews.map(brew => {
                                    const recipe = recipes.find(r => r.id === brew.recipeId);
                                    return (
                                        <div 
                                            key={brew.id}
                                            className={`w-full text-xs p-1 rounded text-left flex justify-between items-center group ${
                                                brew.status === 'completed' 
                                                    ? 'bg-green-900/40 text-green-300 border border-green-900/50' 
                                                    : 'bg-blue-900/40 text-blue-300 border border-blue-900/50 hover:bg-blue-800/60'
                                            }`}
                                        >
                                            <span 
                                                className="truncate cursor-pointer flex-1"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (brew.status === 'planned' && confirm(`Начать варку: ${recipe?.name}?`)) {
                                                        if (recipe) handleBrew(recipe, brew.id);
                                                    }
                                                }}
                                                title={recipe?.name}
                                            >
                                                {brew.status === 'completed' && <CheckCircle2 className="inline w-3 h-3 mr-1" />}
                                                {recipe?.name}
                                            </span>
                                            {(currentUser.role === 'admin' || currentUser.role === 'brewer') && brew.status === 'planned' && (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteScheduledBrew(brew.id);
                                                    }}
                                                    className="text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Shifts */}
                                {dayShifts.map(shift => (
                                    <div key={shift.id} className="w-full text-[10px] p-1 rounded flex justify-between items-center bg-gray-700/50 text-gray-300 border border-gray-600/50 group">
                                         <span className="flex items-center gap-1 truncate">
                                             {shift.type === 'day' ? <Sun className="w-3 h-3 text-amber-400" /> : <Moon className="w-3 h-3 text-indigo-400" />}
                                             {shift.username}
                                         </span>
                                         {(currentUser.role === 'admin' || currentUser.role === 'brewer') && (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteShift(shift.id);
                                                }}
                                                className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {selectedDateForEvent && (
                 <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-sm p-6">
                        <h3 className="text-lg font-bold text-white mb-2">События на {selectedDateForEvent}</h3>
                        
                        <div className="flex bg-gray-700 rounded p-1 mb-4">
                            <button 
                                onClick={() => setScheduleModalTab('brew')} 
                                className={`flex-1 text-sm py-1.5 rounded transition-colors ${scheduleModalTab === 'brew' ? 'bg-gray-600 text-white shadow' : 'text-gray-400'}`}
                            >
                                Варки
                            </button>
                            <button 
                                onClick={() => setScheduleModalTab('shift')} 
                                className={`flex-1 text-sm py-1.5 rounded transition-colors ${scheduleModalTab === 'shift' ? 'bg-gray-600 text-white shadow' : 'text-gray-400'}`}
                            >
                                График работы
                            </button>
                        </div>
                        
                        {scheduleModalTab === 'brew' && (
                            <div className="space-y-2 max-h-60 overflow-y-auto mb-6">
                                {recipes.length === 0 && <p className="text-center text-gray-500 text-sm py-4">Нет рецептов</p>}
                                {recipes.map(recipe => (
                                    <button
                                        key={recipe.id}
                                        onClick={() => handleScheduleBrew(recipe.id)}
                                        className="w-full text-left p-3 rounded bg-gray-700 hover:bg-gray-600 text-white flex justify-between items-center transition-colors"
                                    >
                                        <span>{recipe.name}</span>
                                        <span className="text-xs text-gray-400">{recipe.outputAmount}л</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {scheduleModalTab === 'shift' && (
                            <div className="space-y-4 mb-6">
                                <p className="text-xs text-gray-400">Назначить смену сотруднику:</p>
                                <div className="space-y-2">
                                    {users.map(user => (
                                        <div key={user.username} className="flex items-center justify-between bg-gray-700 p-2 rounded">
                                            <span className="text-sm text-white">{user.username}</span>
                                            <div className="flex gap-1">
                                                <button 
                                                    onClick={() => handleScheduleShift(user.username, 'day')}
                                                    className="p-1 bg-gray-600 hover:bg-amber-600 rounded text-amber-200 transition-colors"
                                                    title="Дневная смена"
                                                >
                                                    <Sun className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={() => handleScheduleShift(user.username, 'night')}
                                                    className="p-1 bg-gray-600 hover:bg-indigo-600 rounded text-indigo-200 transition-colors"
                                                    title="Ночная смена"
                                                >
                                                    <Moon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                         <button onClick={() => setSelectedDateForEvent(null)} className="w-full bg-gray-600 hover:bg-gray-500 text-white py-2 rounded transition-colors">Отмена</button>
                    </div>
                 </div>
            )}
        </div>
      );
  };

  const renderEmployees = () => {
      if(currentUser.role !== 'admin') return <div className="p-8 text-center text-gray-500">Доступ запрещен</div>;

      return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                 <h2 className="text-xl font-bold text-white">Сотрудники</h2>
                 <button 
                    onClick={() => setIsEmployeeModalOpen(true)}
                    className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium"
                 >
                     <UserPlus className="w-4 h-4" /> Добавить сотрудника
                 </button>
            </div>
            
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-gray-900 text-gray-400 text-xs uppercase">
                            <th className="p-4">Пользователь</th>
                            <th className="p-4">Должность</th>
                            <th className="p-4">Пароль</th>
                            <th className="p-4 text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {users.map((user, idx) => (
                            <tr key={idx} className="hover:bg-gray-700/50">
                                <td className="p-4 font-medium text-white">{user.username}</td>
                                <td className="p-4">
                                    <span className={`text-xs px-2 py-1 rounded uppercase font-bold ${
                                        user.role === 'admin' ? 'bg-amber-900/30 text-amber-500' :
                                        user.role === 'brewer' ? 'bg-blue-900/30 text-blue-500' :
                                        user.role === 'tester' ? 'bg-pink-900/30 text-pink-500' :
                                        'bg-gray-700 text-gray-400'
                                    }`}>
                                        {user.role === 'admin' ? 'Администратор' : user.role === 'brewer' ? 'Пивовар' : user.role === 'tester' ? 'Тестер' : 'Помощник'}
                                    </span>
                                </td>
                                <td className="p-4 text-gray-500 font-mono text-xs">{user.password}</td>
                                <td className="p-4 text-right">
                                    {user.username !== currentUser.username && (
                                        <button 
                                            onClick={() => handleDeleteEmployee(user.username)}
                                            className="text-gray-500 hover:text-red-400"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      );
  };

  // --- Render (Main Structure) ---
  const NavButton = ({ tab, icon: Icon, label }: { tab: typeof activeTab, icon: any, label: string }) => (
    <button 
        onClick={() => { setActiveTab(tab); setIsMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === tab ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}
    >
        <Icon className="w-5 h-5" /> {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col md:flex-row relative">
      {/* Mobile Header */}
      <div className="md:hidden bg-gray-950 p-4 border-b border-gray-800 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="bg-amber-500 p-1.5 rounded-lg"><Beer className="w-5 h-5 text-gray-900" /></div>
            <span className="text-lg font-bold tracking-tight text-white">BrewMaster<span className="text-amber-500">AI</span></span>
          </div>
          <div className="flex items-center gap-4">
             <NotificationBell notifications={notifications} onClear={() => setNotifications([])} />
             <button onClick={() => setIsMobileMenuOpen(true)} className="text-gray-300"><Menu className="w-6 h-6" /></button>
          </div>
      </div>

      {isMobileMenuOpen && <div className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-950 border-r border-gray-800 flex flex-col transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static md:h-screen md:shrink-0`}>
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 p-2 rounded-lg"><Beer className="w-6 h-6 text-gray-900" /></div>
            <div className="flex flex-col">
                <span className="text-xl font-bold tracking-tight text-white">BrewMaster<span className="text-amber-500">AI</span></span>
                <span className="text-[10px] text-gray-400 uppercase tracking-widest truncate max-w-[120px]">{breweryName}</span>
            </div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-gray-400"><X className="w-6 h-6" /></button>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavButton tab="dashboard" icon={BarChart3} label="Панель управления" />
          <NavButton tab="inventory" icon={Package} label="Склад" />
          <NavButton tab="production" icon={Factory} label="Производство" />
          <NavButton tab="ai" icon={MessageSquare} label="AI Помощник" />
          {currentUser.role === 'admin' && <NavButton tab="employees" icon={Users} label="Сотрудники" />}
          {currentUser.role === 'admin' && <NavButton tab="integrations" icon={ArrowRightLeft} label="Интеграции" />}

          {installPrompt && (
              <button 
                onClick={() => { handleInstallClick(); setIsMobileMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-amber-500 hover:bg-amber-900/20 bg-amber-900/10 mt-4"
            >
                <Download className="w-5 h-5" /> Установить приложение
            </button>
          )}
        </nav>

        <div className="p-6 border-t border-gray-800">
           <div className="text-xs text-gray-500 mb-2">Вы вошли как</div>
           <div className="flex items-center justify-between mb-2">
               <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs ${
                      currentUser.role === 'admin' ? 'bg-amber-600' : 
                      currentUser.role === 'brewer' ? 'bg-blue-600' : 
                      currentUser.role === 'tester' ? 'bg-pink-600' :
                      'bg-gray-600'
                  }`}>
                      {currentUser.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <div className="text-sm font-medium text-gray-300 truncate max-w-[80px]">{currentUser.username}</div>
                  </div>
               </div>
               <button onClick={onLogout} className="text-gray-400 hover:text-red-400 transition-colors" title="Выйти"><LogOut className="w-5 h-5" /></button>
           </div>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-x-hidden w-full relative">
        {isInventoryModalOpen && renderInventoryModal()}
        {isRecipeModalOpen && renderRecipeModal()}
        {isEmployeeModalOpen && renderEmployeeModal()}
        {manualInputModal.isOpen && renderManualInputModal()}

        <header className="mb-6 hidden md:flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white capitalize">
              {activeTab === 'dashboard' && 'Панель управления'}
              {activeTab === 'inventory' && 'Управление складом'}
              {activeTab === 'production' && 'Производство и График'}
              {activeTab === 'ai' && 'AI Помощник'}
              {activeTab === 'integrations' && 'Системные интеграции'}
              {activeTab === 'employees' && 'Управление сотрудниками'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
              <NotificationBell notifications={notifications} onClear={() => setNotifications([])} />
          </div>
        </header>

        {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-fade-in">
              {/* Dashboard Content */}
              <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-lg overflow-hidden">
                <div className="p-6 border-b border-gray-700 bg-gray-900/50">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3"><CheckSquare className="text-amber-500 w-6 h-6" /> Задачи смены</h3>
                        <span className="text-sm font-medium text-gray-400">{tasks.filter(t => t.completed).length} из {tasks.length} выполнено</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2.5 mb-2">
                        <div className="bg-amber-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${tasks.length === 0 ? 0 : Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100)}%` }}></div>
                    </div>
                </div>
                <div className="p-6">
                    {currentUser.role !== 'assistant' && currentUser.role !== 'tester' && (
                        <div className="flex gap-3 mb-6">
                            <input type="text" value={newTaskText} onChange={(e) => setNewTaskText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} placeholder="Добавить новую задачу для смены..." className="flex-1 bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2 focus:border-amber-500 focus:outline-none" />
                            <button onClick={addTask} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"><Plus className="w-4 h-4" /> Добавить</button>
                        </div>
                    )}
                    <div className="space-y-3">
                        {tasks.map(task => (
                            <div key={task.id} className={`flex items-center justify-between p-4 rounded-lg border transition-all ${task.completed ? "bg-gray-900/50 border-gray-800 opacity-60" : "bg-gray-700/30 border-gray-600 hover:bg-gray-700/50"}`}>
                                <div className="flex items-center gap-4 flex-1">
                                    <button onClick={() => toggleTask(task.id)} className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${task.completed ? "bg-green-500 border-green-500 text-white" : "bg-transparent border-gray-500 hover:border-amber-500"}`}>{task.completed && <CheckCircle2 className="w-4 h-4" />}</button>
                                    <span className={`text-sm md:text-base ${task.completed ? "line-through text-gray-500" : "text-gray-200"}`}>{task.text}</span>
                                </div>
                                {currentUser.role !== 'assistant' && currentUser.role !== 'tester' && <button onClick={() => deleteTask(task.id)} className="text-gray-500 hover:text-red-400 p-2 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                            </div>
                        ))}
                    </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* Activity Log */}
                 <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-700 bg-gray-800/50"><h3 className="font-semibold text-white flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-400" /> Недавняя активность</h3></div>
                    <div className="p-4">
                        <ul className="space-y-3">
                            {logs.slice(0, 5).map(log => (
                            <li key={log.id} className="flex items-start justify-between text-sm pb-3 border-b border-gray-700 last:border-0">
                                <div><span className={`font-bold ${log.action === 'ПРИХОД' ? 'text-green-400' : log.action === 'РАСХОД' ? 'text-red-400' : 'text-purple-400'}`}>{log.action}</span><p className="text-gray-300">{log.details}</p></div>
                                <span className="text-gray-500 text-xs">{new Date(log.timestamp).toLocaleTimeString()}</span>
                            </li>
                            ))}
                        </ul>
                    </div>
                 </div>
                 {/* Low Stock */}
                 <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-700 bg-gray-800/50"><h3 className="font-semibold text-white flex items-center gap-2"><Droplet className="w-4 h-4 text-amber-500" /> Требуется закупка</h3></div>
                    <div className="p-4">
                        <ul className="space-y-3">
                        {inventory.filter(i => (i.quantity - (reservedInventory[i.id]||0)) <= i.minLevel).map(item => (
                            <li key={item.id} className="flex items-center justify-between text-sm p-3 bg-red-900/10 border border-red-900/30 rounded-lg">
                                <span className="text-gray-200 font-medium">{item.name}</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-red-400 font-bold">{(item.quantity - (reservedInventory[item.id]||0)).toFixed(1)} {item.unit}</span>
                                </div>
                            </li>
                        ))}
                        </ul>
                    </div>
                 </div>
              </div>
            </div>
        )}
        {activeTab === 'inventory' && renderInventory()}
        {activeTab === 'production' && (
             <div>
              <div className="flex bg-gray-800 p-1 rounded-lg w-full md:w-auto md:inline-flex mb-6 border border-gray-700">
                  <button onClick={() => setProductionView('recipes')} className={`flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-medium transition-all ${productionView === 'recipes' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>Техкарты</button>
                  <button onClick={() => setProductionView('schedule')} className={`flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-medium transition-all ${productionView === 'schedule' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>Календарь и График</button>
              </div>
              {productionView === 'recipes' ? (
                  <div className="space-y-6 animate-fade-in">
                      <div className="flex justify-end">{currentUser.role !== 'assistant' && currentUser.role !== 'tester' && (<button onClick={() => { setEditingRecipe({ name: "", ingredients: [], outputAmount: 0, outputItemId: "" }); setIsRecipeModalOpen(true); }} className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium"><Plus className="w-4 h-4" /> Создать карту</button>)}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {recipes.map(recipe => (
                            <div key={recipe.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg flex flex-col group">
                                <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center">
                                    <h3 className="font-bold text-lg text-white flex items-center gap-2"><Factory className="w-5 h-5 text-purple-500" />{recipe.name}</h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs bg-purple-900/30 text-purple-300 px-2 py-1 rounded">{recipe.outputAmount}л</span>
                                        {currentUser.role !== 'assistant' && currentUser.role !== 'tester' && (<><button onClick={() => { setEditingRecipe(JSON.parse(JSON.stringify(recipe))); setIsRecipeModalOpen(true); }} className="p-1 text-gray-400 hover:text-white transition-colors"><Edit className="w-4 h-4" /></button><button onClick={() => handleDeleteRecipe(recipe.id)} className="p-1 text-gray-400 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button></>)}
                                    </div>
                                </div>
                                <div className="p-6 flex-1">
                                    <h4 className="text-gray-400 text-xs uppercase font-semibold mb-3">Состав:</h4>
                                    <ul className="space-y-2 mb-6">
                                        {recipe.ingredients.map((ing, idx) => {
                                            const item = inventory.find(i => i.id === ing.itemId);
                                            // Check against total quantity for brew possibility
                                            const hasEnough = item && item.quantity >= ing.amount;
                                            return (
                                                <li key={idx} className="flex justify-between items-center text-sm border-b border-gray-700 pb-2 last:border-0">
                                                    <span className="text-gray-300">{item?.name || "Неизвестно"}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-gray-400">{ing.amount} {item?.unit}</span>
                                                        {!hasEnough && <AlertTriangle className="w-4 h-4 text-red-500" />}
                                                    </div>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                    <button onClick={() => handleBrew(recipe)} disabled={currentUser.role === 'tester'} className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"><Beaker className="w-5 h-5" /> Произвести</button>
                                </div>
                            </div>
                        ))}
                      </div>
                  </div>
              ) : renderSchedule()}
             </div>
        )}
        {activeTab === 'ai' && (
            <div className="flex flex-col h-[calc(100vh-240px)] md:h-[600px] bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden">
                <div className="p-4 bg-gray-900 border-b border-gray-700 flex items-center justify-between"><h3 className="text-white font-semibold flex items-center gap-2"><MessageSquare className="w-5 h-5 text-purple-400" /> AI Ассистент</h3></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                    {messages.map((msg, idx) => (<div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] md:max-w-[80%] p-3 rounded-lg text-sm leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none border border-gray-600'}`}>{msg.text}</div></div>))}
                    {isProcessing && <div className="bg-gray-700 text-gray-400 p-3 rounded-lg w-fit text-xs">Анализирую данные...</div>}
                    <div ref={messagesEndRef} />
                </div>
                <div className="p-4 bg-gray-900 border-t border-gray-700"><div className="flex items-center gap-2"><input type="text" value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Напишите запрос..." className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500" disabled={isProcessing} /><button onClick={sendMessage} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg"><Send className="w-5 h-5" /></button></div></div>
            </div>
        )}
        {activeTab === 'integrations' && (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col items-center text-center space-y-4">
                    <div className="bg-green-900/30 p-4 rounded-full"><FileSpreadsheet className="w-8 h-8 text-green-500" /></div>
                    <h3 className="text-lg font-bold text-white">Excel / CSV</h3>
                    <p className="text-gray-400 text-xs">Выгрузка остатков.</p>
                    <button className="mt-auto bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm w-full">Скачать .CSV</button>
                </div>
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col items-center text-center space-y-4">
                     <div className="bg-blue-900/30 p-4 rounded-full"><FileText className="w-8 h-8 text-blue-500" /></div>
                     <h3 className="text-lg font-bold text-white">Google Docs</h3>
                     <p className="text-gray-400 text-xs">Создать отчет в Docs.</p>
                     <button className="mt-auto bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm w-full">Создать отчет</button>
                </div>
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col items-center text-center space-y-4">
                     <div className="bg-red-900/30 p-4 rounded-full"><Database className="w-8 h-8 text-red-500" /></div>
                     <h3 className="text-lg font-bold text-white">1С:Предприятие</h3>
                     <p className="text-gray-400 text-xs">Синхронизация с ERP.</p>
                     <button className="mt-auto bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm w-full">Синхронизация</button>
                </div>
             </div>
        )}
        {activeTab === 'employees' && renderEmployees()}
      </main>
    </div>
  );
};

// --- Root Component (Handles Auth & Routing) ---

const Root = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [formData, setFormData] = useState({ brewery: "", user: "", password: "" });
  const [error, setError] = useState("");
  
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);

  const handleAuth = (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (!formData.brewery || !formData.user || !formData.password) {
          setError("Заполните все поля");
          return;
      }

      const usersKey = `${formData.brewery}_users`;
      const storedUsersStr = localStorage.getItem(usersKey);
      let users: UserAccount[] = storedUsersStr ? JSON.parse(storedUsersStr) : [];

      if (authMode === "register") {
          // Check if brewery exists (has users)
          if (users.length > 0) {
              setError("Пивоварня с таким именем уже существует. Пожалуйста, войдите.");
              return;
          }
          // Create Admin User
          const newAdmin: UserAccount = { username: formData.user, password: formData.password, role: "admin" };
          localStorage.setItem(usersKey, JSON.stringify([newAdmin]));
          
          // Seed initial data for this brewery
          localStorage.setItem(`${formData.brewery}_inventory`, JSON.stringify(INITIAL_INVENTORY));
          localStorage.setItem(`${formData.brewery}_recipes`, JSON.stringify(INITIAL_RECIPES));
          
          setCurrentUser(newAdmin);
          setIsAuthenticated(true);
      } else {
          // Login Mode
          const foundUser = users.find(u => u.username === formData.user && u.password === formData.password);
          if (foundUser) {
              setCurrentUser(foundUser);
              setIsAuthenticated(true);
          } else {
              setError("Неверное имя пивоварни, пользователь или пароль.");
          }
      }
  };

  if (isAuthenticated && currentUser) {
      return (
        <BreweryApp 
            breweryName={formData.brewery} 
            currentUser={currentUser} 
            onLogout={() => { setIsAuthenticated(false); setFormData({brewery: "", user: "", password: ""}); }} 
        />
      );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-xl border border-gray-700 shadow-2xl p-8">
        <div className="flex flex-col items-center mb-8">
            <div className="bg-amber-500 p-3 rounded-xl mb-4">
                <Beer className="w-8 h-8 text-gray-900" />
            </div>
            <h1 className="text-2xl font-bold text-white">BrewMaster<span className="text-amber-500">AI</span></h1>
            <p className="text-gray-400 text-sm mt-2">
                {authMode === "login" ? "Вход в систему" : "Регистрация пивоварни"}
            </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
            <div>
                <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">Название пивоварни</label>
                <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input 
                        type="text"
                        value={formData.brewery}
                        onChange={e => setFormData({...formData, brewery: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg pl-10 pr-4 py-3 focus:border-amber-500 focus:outline-none transition-colors"
                        placeholder="Например: CraftBest"
                    />
                </div>
            </div>

            <div>
                <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">
                    {authMode === 'register' ? 'Имя администратора' : 'Пользователь'}
                </label>
                <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input 
                        type="text"
                        value={formData.user}
                        onChange={e => setFormData({...formData, user: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg pl-10 pr-4 py-3 focus:border-amber-500 focus:outline-none transition-colors"
                        placeholder="admin"
                    />
                </div>
            </div>

            <div>
                <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">Пароль</label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input 
                        type="password"
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg pl-10 pr-4 py-3 focus:border-amber-500 focus:outline-none transition-colors"
                        placeholder="••••••••"
                    />
                </div>
            </div>

            {error && (
                <div className="text-red-400 text-sm text-center bg-red-900/20 p-2 rounded border border-red-900/50 flex items-center justify-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> {error}
                </div>
            )}

            <button 
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-3 rounded-lg transition-colors mt-4 shadow-lg shadow-amber-500/20"
            >
                {authMode === "login" ? "Войти" : "Создать базу данных"}
            </button>
        </form>
        
        <div className="mt-6 text-center">
            <button 
                onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setError(""); }}
                className="text-sm text-amber-500 hover:text-amber-400 underline decoration-dashed underline-offset-4"
            >
                {authMode === "login" ? "Первый запуск? Зарегистрировать пивоварню" : "Уже есть аккаунт? Войти"}
            </button>
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<Root />);