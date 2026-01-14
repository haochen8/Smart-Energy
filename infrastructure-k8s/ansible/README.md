# Ansible – k3s bootstrap for 2dv013-Smart-energy

Use this playbook after Terraform finishes to install k3s + Prometheus on the new VMs.

Prepare inventory
- From `terraform` outputs, grab `floating_ip`, `cp_private_ips`, and `worker_private_ips`.
- Edit `inventory.ini` (or copy `inventory.ini.template`) and replace placeholders.
- If workers only have private IPs, enable the ProxyCommand line to jump through the control-plane public IP.

Run
```bash
cd ansible
ansible-playbook -i inventory.ini deploy-k3s.yml
```

Notes
- Default SSH user is `ubuntu` (set by the Ubuntu image); adjust if you use another image.
- Ensure the same private key configured in Terraform (`identity_file`) is readable by Ansible.
- The playbook installs k3s server on `k3s_server` hosts and joins `k3s_agents` as workers.
