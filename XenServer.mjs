import * as XenAPI from 'xen-api';

let xapiConnection;

const SERVER_CONFIG = {
  host: 'your_xcp_ng_host',
  username: 'your_username',
  password: 'your_password'
};

class XenServerError extends Error {
  constructor(message, type) {
    super(message);
    this.name = 'XenServerError';
    this.type = type;
  }
}

function validateServerConfig(config) {
  const requiredFields = ['host', 'username', 'password'];
  for (const field of requiredFields) {
    if (!config[field]) {
      throw new XenServerError(`Missing required field: ${field}`, 'ConfigError');
    }
  }
}

async function connectToXenServer() {
  try {
    validateServerConfig(SERVER_CONFIG);
    xapiConnection = await XenAPI.connect(SERVER_CONFIG);
    console.log('Successfully connected to XenServer');
    return xapiConnection;
  } catch (error) {
    handleConnectionError(error);
    throw new XenServerError(`Connection failed: ${error.message}`, 'ConnectionError');
  }
}

function handleConnectionError(error) {
  if (error instanceof XenServerError) {
    console.error(`Configuration error: ${error.message}`);
  } else if (error.code === 'ECONNREFUSED') {
    console.error('Connection refused. Please check the host and network.');
  } else if (error.message.includes('authentication')) {
    console.error('Authentication failed. Please check your username and password.');
  } else {
    console.error('Failed to connect to XenServer:', error.message);
  }
}

async function disconnectFromXenServer() {
  if (xapiConnection) {
    try {
      await xapiConnection.disconnect();
      console.log('Successfully disconnected from XenServer');
    } catch (error) {
      console.error('Error disconnecting from XenServer:', error.message);
    } finally {
      xapiConnection = null;
    }
  }
}

async function main() {
  try {
    await connectToXenServer();
  } catch (error) {
    handleXenServerError(error);
  } finally {
    await disconnectFromXenServer();
  }
}
main()

function handleXenServerError(error) {
  if (error instanceof XenServerError) {
    console.error(`XenServer Error (${error.type}):`, error.message);
  } else {
    console.error('An unexpected error occurred:', error.message);
  }
}

async function listVMs() {
  try {
    const xapi = await connectToXenServer();
    const vms = await xapi.objects.VM.get_all_records();

    return Object.values(vms)
      .filter(vm => !vm.is_a_template && !vm.is_control_domain)
      .map(vm => ({
        uuid: vm.uuid,
        name: vm.name_label,
        power_state: vm.power_state,
        memory: vm.memory_static_max,
      }));
  } catch (error) {
    console.error('Error listing VMs:', error.message);
    throw error;
  } finally {
    await disconnectFromXenServer();
  }
}

async function getVMMetrics(vmUuid) {
  try {
    const xapi = await connectToXenServer();
    const vm = await xapi.VM.get_record(vmUuid);
    const metrics = await xapi.VM_metrics.get_record(vm.metrics);

    return {
      cpu_usage: metrics.VCPUs_utilisation,
      memory_usage: metrics.memory_actual,
    };
  } catch (error) {
    console.error(`Error getting VM metrics for ${vmUuid}:`, error.message);
    throw error;
  } finally {
    await disconnectFromXenServer();
  }
}

async function startVM(vmUuid) {
  try {
    const xapi = await connectToXenServer();
    const vm = await xapi.VM.get_record(vmUuid);

    if (vm.power_state !== 'Running') {
      await xapi.VM.start(vm.$ref, false, false);
      console.log(`VM ${vm.name_label} started.`);
    } else {
      console.log(`VM ${vm.name_label} is already running.`);
    }
  } catch (error) {
    console.error(`Error starting VM ${vmUuid}:`, error.message);
    throw error;
  } finally {
    await disconnectFromXenServer();
  }
}

async function stopVM(vmUuid) {
  try {
    const xapi = await connectToXenServer();
    const vm = await xapi.VM.get_record(vmUuid);

    if (vm.power_state === 'Running') {
      await xapi.VM.hard_shutdown(vm.$ref);
      console.log(`VM ${vm.name_label} stopped.`);
    } else {
      console.log(`VM ${vm.name_label} is not running.`);
    }
  } catch (error) {
    console.error(`Error stopping VM ${vmUuid}:`, error.message);
    throw error;
  } finally {
    await disconnectFromXenServer();
  }
}

async function rebootVM(vmUuid) {
  try {
    const xapi = await connectToXenServer();
    const vm = await xapi.VM.get_record(vmUuid);

    if (vm.power_state === 'Running') {
      await xapi.VM.clean_reboot(vm.$ref);
      console.log(`VM ${vm.name_label} rebooted.`);
    } else {
      console.log(`VM ${vm.name_label} is not running. Cannot reboot.`);
    }
  } catch (error) {
    console.error(`Error rebooting VM ${vmUuid}:`, error.message);
    throw error;
  } finally {
    await disconnectFromXenServer();
  }
}

async function createVM(vmConfig) {
  try {
    const xapi = await connectToXenServer();
    const template = await xapi.VM.get_by_name_label(vmConfig.template)[0];
    
    const newVM = await xapi.VM.clone(template, vmConfig.name);
    await xapi.VM.set_memory_limits(newVM, vmConfig.memory, vmConfig.memory, vmConfig.memory, vmConfig.memory);
    await xapi.VM.set_VCPUs_max(newVM, vmConfig.vcpus);
    await xapi.VM.set_VCPUs_at_startup(newVM, vmConfig.vcpus);
    
    if (vmConfig.start) {
      await xapi.VM.start(newVM, false, false);
    }
    
    console.log(`VM ${vmConfig.name} created successfully.`);
    return newVM;
  } catch (error) {
    console.error('Error creating VM:', error.message);
    throw error;
  } finally {
    await disconnectFromXenServer();
  }
}

async function deleteVM(vmUuid) {
  try {
    const xapi = await connectToXenServer();
    const vm = await xapi.VM.get_by_uuid(vmUuid);
    
    if (vm.power_state === 'Running') {
      await xapi.VM.hard_shutdown(vm.$ref);
    }
    
    await xapi.VM.destroy(vm.$ref);
    console.log(`VM ${vmUuid} deleted successfully.`);
  } catch (error) {
    console.error(`Error deleting VM ${vmUuid}:`, error.message);
    throw error;
  } finally {
    await disconnectFromXenServer();
  }
}

async function createUser(username, password, role) {
  try {
    const xapi = await connectToXenServer();
    const subject = await xapi.subject.create({ other_config: {}, display: username });
    await xapi.subject.set_other_config(subject, 'subject-name', username);
    await xapi.subject.set_other_config(subject, 'subject-password', password);
    
    const roleRef = await xapi.role.get_by_name_label(role)[0];
    await xapi.subject.add_to_roles(subject, roleRef);
    
    console.log(`User ${username} created successfully with role ${role}.`);
    return subject;
  } catch (error) {
    console.error('Error creating user:', error.message);
    throw error;
  } finally {
    await disconnectFromXenServer();
  }
}

async function deleteUser(username) {
  try {
    const xapi = await connectToXenServer();
    const subject = await xapi.subject.get_by_name_label(username)[0];
    
    await xapi.subject.destroy(subject.$ref);
    console.log(`User ${username} deleted successfully.`);
  } catch (error) {
    console.error(`Error deleting user ${username}:`, error.message);
    throw error;
  } finally {
    await disconnectFromXenServer();
  }
}

async function listUsers() {
  try {
    const xapi = await connectToXenServer();
    const subjects = await xapi.subject.get_all_records();
    
    return Object.values(subjects).map(subject => ({
      uuid: subject.uuid,
      username: subject.other_config['subject-name'],
      roles: subject.roles.map(role => role.name_label),
    }));
  } catch (error) {
    console.error('Error listing users:', error.message);
    throw error;
  } finally {
    await disconnectFromXenServer();
  }
}

export { 
  listVMs, 
  getVMMetrics, 
  startVM, 
  stopVM, 
  rebootVM, 
  createVM, 
  deleteVM, 
  createUser, 
  deleteUser, 
  listUsers 
};
