# MICROGENN · MIRM Node.js Sync Unit (Windows Service Guide)

This package converts the MicroGenn IRM/MHMS PMS sync unit into a native **Windows Service** running on Windows Server or Windows 10/11 Pro alongside your Microsoft SQL Server (`admin-pc\sqlexpress`).

---

## 1. Quick Automatic Windows Service Install (Recommended)

1. Copy the `standalone` folder to your Windows PMS server (e.g., `C:\MicroGenn\mirm-sync\`).
2. Right-click **`install-service.bat`** and select **"Run as Administrator"**.
   - It will automatically:
     - Verify Node.js 18+ is installed
     - Create `.env` from `.env.example` if needed
     - Install dependencies (`npm install`)
     - Register **`MicroGennMirmSync`** in Windows Service Control Manager (`services.msc`)
     - Set the service to **Automatic Startup** (starts on boot even before user login)
     - Start the service immediately

---

## 2. Windows Service Management

You can control the service using any of the following:

### A. Using `service-control.bat` (Interactive Menu)
Double-click `service-control.bat` as Administrator:
```text
  [1] Check Service Status (sc query)
  [2] Start Service (net start MicroGennMirmSync)
  [3] Stop Service (net stop MicroGennMirmSync)
  [4] Restart Service
  [5] Open Windows Services Manager (services.msc)
  [6] Open Log Folder (storage/sync_status.json)
  [7] Install Service
  [8] Uninstall Service
```

### B. Windows Command Line (cmd.exe or PowerShell as Admin)
```cmd
net start MicroGennMirmSync
net stop MicroGennMirmSync
sc query MicroGennMirmSync
```

### C. Standard Windows Services GUI
1. Press `Win + R`, type `services.msc`, and press Enter.
2. Scroll to **`MicroGennMirmSync`**.
3. View status, Start, Stop, or configure Recovery actions.

---

## 3. Uninstalling the Service
To remove the Windows service cleanly:
- Right-click **`uninstall-service.bat`** and choose **"Run as Administrator"**, or
- Run: `node uninstall-service.js`

---

## 4. Configuration (`.env`)
Make sure your `.env` contains the correct SQL Server credentials:
```env
IRM_DB_SERVER=admin-pc\sqlexpress
IRM_DB_NAME=vpi3108
IRM_DB_USER=sa
IRM_DB_PASS=mgenn
IRM_DB_PORT=1433
IRM_DB_ENCRYPT=false

IRM_BASE_URL=https://irm.mhms.cloud
IRM_API_KEY=IRM-871EC742622E2080B346AF058223597EC935B6425359C986
IRM_SYNC_INTERVAL=200
```

### SQL Server Express Checklist on Windows:
1. Open **SQL Server Configuration Manager**.
2. Under **SQL Server Network Configuration** > **Protocols for SQLEXPRESS**, ensure **TCP/IP** is **Enabled**.
3. Under TCP/IP properties, check **IPAll** and set TCP Port to `1433`.
4. Ensure **SQL Server Browser** service is running if using named instance (`admin-pc\sqlexpress`).
5. In SQL Server Management Studio (SSMS), ensure Server Properties > Security is set to **SQL Server and Windows Authentication mode**.
